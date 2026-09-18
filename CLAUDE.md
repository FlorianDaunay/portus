# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Portus is a lightweight desktop GUI for Docker: a Tauri 2 app with a Rust backend (talks to the Docker daemon via `bollard`) and a React 18 + TypeScript + Tailwind frontend (Vite). There are no tests or linter configured yet.

## Commands

```bash
npm install
npm run tauri dev      # run the full desktop app (starts Vite on :1420 via beforeDevCommand)
npm run tauri build    # production bundle (runs `npm run build` first)
npm run build          # frontend only: `tsc -b && vite build` (also the way to type-check)
cargo check --manifest-path src-tauri/Cargo.toml   # type-check the Rust backend
```

`npm run dev` alone serves only the frontend in a browser; every backend call will then fail (see below). A running Docker daemon is required for anything useful.

## Architecture

**Request flow:** React page → `src/lib/api.ts` → Tauri `invoke` → `#[tauri::command]` in `src-tauri/src/commands.rs` → `src-tauri/src/docker/*.rs` → `bollard`. Each command calls `docker::connect()` (local defaults) per invocation; there is no shared client state.

**Adding a backend capability touches four places that must stay in sync:**
1. `src-tauri/src/docker/<area>.rs` — the Docker logic.
2. `src-tauri/src/commands.rs` — the `#[tauri::command]` wrapper (errors are `Result<_, String>`).
3. `src-tauri/src/main.rs` — register it in `tauri::generate_handler![...]`.
4. `src/lib/api.ts` + `src/lib/types.ts` — the typed wrapper and TS mirror of the Rust struct.

Rust structs crossing the boundary use `#[serde(rename_all = "camelCase")]`, so `types.ts` fields are camelCase versions of the Rust fields. Command argument names, by contrast, are passed as-is in the `invoke` args object (Tauri converts snake_case params to camelCase on the JS side).

**Docker engine management (`src-tauri/src/docker/engine.rs`):** Portus does not require Docker Desktop. `docker::connect()` delegates to `engine::connect()`, which uses whichever endpoint `engine::detect()` last found answering: the local socket/named pipe first, then the WSL engine at `tcp://127.0.0.1:2376` over **mutual TLS** (there is no plaintext TCP endpoint). `get_daemon_info` re-runs `detect()` on every poll and reports `managed` (true for the WSL engine). When nothing answers, the frontend (`AppShell` -> `EngineSetup`) calls `get_engine_status` and drives a small state machine (`ready | stopped | notInstalled | wslUnavailable | unsupported | error`, always returned as data, never as `Err`, so the UI always has a message): `stopped` auto-starts, `notInstalled` offers `install_engine`. Installing pipes `INSTALL_SCRIPT` (Docker's official apt repo, Ubuntu/Debian only) into `sh -s` in the distro. Starting first runs `PREPARE_SCRIPT` in the distro (private CA + server/client certs under `/etc/portus/tls`, and the `/usr/local/bin/portus-dockerd` wrapper), copies the client certs to `%LOCALAPPDATA%\Portus\tls\{ca,cert,key}.pem` (the standard Docker file names, so `DOCKER_HOST=tcp://127.0.0.1:2376 DOCKER_TLS_VERIFY=1 DOCKER_CERT_PATH=...` works for the CLI), then launches the wrapper through `cmd /c start` in its own hidden `wsl.exe` session. That session is deliberately **not** a child of Portus, so the engine and its containers survive Portus closing, crashing, or being killed with its process tree (it also keeps the distro alive). Do not quote the distro name in that `start` command line: `wsl.exe` then silently does nothing. Users can opt into stopping the engine on exit (`settings.json` in `%LOCALAPPDATA%\Portus`, `stopEngineOnExit`, default false; handled by `RunEvent::Exit` -> `EngineManager::shutdown`) or stop it with the Dashboard's "Stop Docker" (`stop_engine`, after which `EngineSetup` must not auto-restart it: see `src/lib/engineFlags.ts`). Progress is streamed as `engine-log` events; only `error` statuses carry a log. Event listening needs the capability in `src-tauri/capabilities/default.json` (`core:default`).

**Errors from actions are surfaced globally:** `main.tsx` installs a `MutationCache.onError` that shows a toast (`src/lib/toast.ts`, `Toaster`) for any failed mutation. Give each `useMutation` a `meta: { label: "..." }` so the toast says what failed. Tauri rejects `invoke` with the plain `Err(String)`, so use `errorMessage()` from `src/lib/utils.ts` rather than `error.message`.

**No mock data.** `api.ts` throws if `__TAURI_INTERNALS__` is absent (i.e. running in a plain browser). Pages surface this via `ConnectionError`. `get_daemon_info` deliberately returns `connected: false` instead of an error when Docker is unreachable, so the dashboard can render a disconnected state.

**Logs use two mechanisms:** `list_recent_logs` is polled by `Logs.tsx` (react-query `refetchInterval`) and returns the last lines of up to 5 running containers; `stream_container_logs` spawns a background task that pushes `container-log` / `container-log-error` events to the frontend via `app.emit`. Log level is guessed from message text in `docker/logs.rs`.

**Frontend:** `HashRouter` + routes in `src/App.tsx` inside `AppShell`; server state via `@tanstack/react-query` (query keys like `["containers"]`, `["logs"]`); the only zustand store is the theme (`src/lib/theme.ts`, class-based dark mode persisted in localStorage). Shared primitives live in `src/components/ui/`. Use the `@/` alias for `src/` imports. Styling is Tailwind with custom semantic tokens (e.g. `text-text-secondary`, `text-warning`, `text-danger`) defined in `tailwind.config.ts` / `src/styles/index.css`.
