import type {
  ComposeProject,
  ContainerSummary,
  DaemonInfo,
  EngineContents,
  EngineInfo,
  MigrationJob,
  MigrationRequest,
  EngineSource,
  EngineStatus,
  ImageSummary,
  LogLine,
  Settings,
  VolumeSummary,
} from "./types";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) {
    throw new Error("Portus must run inside the desktop app to talk to Docker.");
  }
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

export async function getEngineStatus(): Promise<EngineStatus> {
  return invoke<EngineStatus>("get_engine_status");
}

export async function startEngine(): Promise<EngineStatus> {
  return invoke<EngineStatus>("start_engine");
}

export async function takeoverEngine(): Promise<EngineStatus> {
  return invoke<EngineStatus>("takeover_engine");
}

export async function installEngine(): Promise<EngineStatus> {
  return invoke<EngineStatus>("install_engine");
}

export async function stopEngine(): Promise<EngineStatus> {
  return invoke<EngineStatus>("stop_engine");
}

export async function getSettings(): Promise<Settings> {
  return invoke<Settings>("get_settings");
}

export async function setStopEngineOnExit(value: boolean): Promise<Settings> {
  return invoke<Settings>("set_stop_engine_on_exit", { value });
}

export async function setKeepRunningInBackground(value: boolean): Promise<Settings> {
  return invoke<Settings>("set_keep_running_in_background", { value });
}

export async function setStartMinimized(value: boolean): Promise<Settings> {
  return invoke<Settings>("set_start_minimized", { value });
}

export async function setLaunchAtStartup(value: boolean): Promise<Settings> {
  return invoke<Settings>("set_launch_at_startup", { value });
}

export async function listEngines(): Promise<EngineInfo[]> {
  return invoke<EngineInfo[]>("list_engines");
}

export async function getEngineContents(kind: string): Promise<EngineContents> {
  return invoke<EngineContents>("get_engine_contents", { kind });
}

export async function listMigrations(): Promise<MigrationJob[]> {
  return invoke<MigrationJob[]>("list_migrations");
}

export async function startMigration(request: MigrationRequest): Promise<MigrationJob> {
  return invoke<MigrationJob>("start_migration", { request });
}

export async function cancelMigration(id: number): Promise<void> {
  return invoke<void>("cancel_migration", { id });
}

export async function clearMigrationHistory(): Promise<void> {
  return invoke<void>("clear_migration_history");
}

export async function onMigrationUpdate(callback: (job: MigrationJob) => void): Promise<() => void> {
  if (!isTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<MigrationJob>("migration-update", (event) => callback(event.payload));
}

export async function setEngineSource(source: EngineSource, endpoint?: string, tlsDir?: string): Promise<Settings> {
  return invoke<Settings>("set_engine_source", { source, endpoint, tlsDir });
}

export async function onEngineLog(callback: (line: string) => void): Promise<() => void> {
  if (!isTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<string>("engine-log", (event) => callback(event.payload));
}

export async function getDaemonInfo(): Promise<DaemonInfo> {
  return invoke<DaemonInfo>("get_daemon_info");
}

export async function listContainers(): Promise<ContainerSummary[]> {
  return invoke<ContainerSummary[]>("list_containers");
}

export async function startContainer(id: string): Promise<void> {
  return invoke<void>("start_container", { id });
}

export async function stopContainer(id: string): Promise<void> {
  return invoke<void>("stop_container", { id });
}

export async function restartContainer(id: string): Promise<void> {
  return invoke<void>("restart_container", { id });
}

export async function removeContainer(id: string): Promise<void> {
  return invoke<void>("remove_container", { id });
}

export async function listImages(): Promise<ImageSummary[]> {
  return invoke<ImageSummary[]>("list_images");
}

export async function removeImage(id: string): Promise<void> {
  return invoke<void>("remove_image", { id });
}

export async function listVolumes(): Promise<VolumeSummary[]> {
  return invoke<VolumeSummary[]>("list_volumes");
}

export async function removeVolume(name: string): Promise<void> {
  return invoke<void>("remove_volume", { name });
}

export async function listComposeProjects(): Promise<ComposeProject[]> {
  return invoke<ComposeProject[]>("list_compose_projects");
}

export async function listRecentLogs(): Promise<LogLine[]> {
  return invoke<LogLine[]>("list_recent_logs");
}

export interface ConsoleOutput {
  runId: number;
  stream: "out" | "err";
  line: string;
}

export interface ConsoleExit {
  runId: number;
  code: number | null;
}

export async function runConsoleCommand(runId: number, line: string): Promise<void> {
  return invoke<void>("run_console_command", { runId, line });
}

export async function cancelConsoleCommand(runId: number): Promise<void> {
  return invoke<void>("cancel_console_command", { runId });
}

export async function onConsoleEvents(
  onOutput: (event: ConsoleOutput) => void,
  onExit: (event: ConsoleExit) => void
): Promise<() => void> {
  if (!isTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  const stops = await Promise.all([
    listen<ConsoleOutput>("console-output", (e) => onOutput(e.payload)),
    listen<ConsoleExit>("console-exit", (e) => onExit(e.payload)),
  ]);
  return () => stops.forEach((stop) => stop());
}

export { isTauri };
