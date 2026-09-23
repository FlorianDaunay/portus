import type {
  ComposeProject,
  ContainerSummary,
  DaemonInfo,
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

export { isTauri };
