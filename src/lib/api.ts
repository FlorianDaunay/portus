import type {
  ComposeProject,
  ContainerSummary,
  DaemonInfo,
  ImageSummary,
  LogLine,
  VolumeSummary,
} from "./types";
import {
  mockCompose,
  mockContainers,
  mockDaemonInfo,
  mockImages,
  mockLogs,
  mockVolumes,
} from "./mock-data";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

const delay = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));

let containers = [...mockContainers];

export async function getDaemonInfo(): Promise<DaemonInfo> {
  if (isTauri) return invoke<DaemonInfo>("get_daemon_info");
  await delay();
  return {
    ...mockDaemonInfo,
    containersRunning: containers.filter((c) => c.status === "running").length,
    containersStopped: containers.filter((c) => c.status !== "running").length,
  };
}

export async function listContainers(): Promise<ContainerSummary[]> {
  if (isTauri) return invoke<ContainerSummary[]>("list_containers");
  await delay();
  return containers;
}

export async function startContainer(id: string): Promise<void> {
  if (isTauri) return invoke<void>("start_container", { id });
  await delay();
  containers = containers.map((c) =>
    c.id === id ? { ...c, status: "running", statusText: "Up less than a second" } : c
  );
}

export async function stopContainer(id: string): Promise<void> {
  if (isTauri) return invoke<void>("stop_container", { id });
  await delay();
  containers = containers.map((c) =>
    c.id === id ? { ...c, status: "exited", statusText: "Exited (0) less than a second ago", cpuPercent: 0, memPercent: 0 } : c
  );
}

export async function restartContainer(id: string): Promise<void> {
  if (isTauri) return invoke<void>("restart_container", { id });
  await delay();
  containers = containers.map((c) =>
    c.id === id ? { ...c, status: "running", statusText: "Up less than a second" } : c
  );
}

export async function removeContainer(id: string): Promise<void> {
  if (isTauri) return invoke<void>("remove_container", { id });
  await delay();
  containers = containers.filter((c) => c.id !== id);
}

export async function listImages(): Promise<ImageSummary[]> {
  if (isTauri) return invoke<ImageSummary[]>("list_images");
  await delay();
  return mockImages;
}

export async function removeImage(id: string): Promise<void> {
  if (isTauri) return invoke<void>("remove_image", { id });
  await delay();
}

export async function listVolumes(): Promise<VolumeSummary[]> {
  if (isTauri) return invoke<VolumeSummary[]>("list_volumes");
  await delay();
  return mockVolumes;
}

export async function removeVolume(name: string): Promise<void> {
  if (isTauri) return invoke<void>("remove_volume", { name });
  await delay();
}

export async function listComposeProjects(): Promise<ComposeProject[]> {
  if (isTauri) return invoke<ComposeProject[]>("list_compose_projects");
  await delay();
  return mockCompose;
}

export async function listRecentLogs(): Promise<LogLine[]> {
  if (isTauri) return invoke<LogLine[]>("list_recent_logs");
  await delay();
  return mockLogs;
}

export { isTauri };
