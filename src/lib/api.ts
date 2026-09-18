import type {
  ComposeProject,
  ContainerSummary,
  DaemonInfo,
  ImageSummary,
  LogLine,
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
