export type ContainerStatus = "running" | "exited" | "paused" | "restarting" | "created";

export interface ContainerSummary {
  id: string;
  name: string;
  image: string;
  imageId: string;
  status: ContainerStatus;
  statusText: string;
  ports: string[];
  createdAt: string;
  project?: string;
  volumes: string[];
  cpuPercent: number;
  memPercent: number;
  memUsageMb: number;
  memLimitMb: number;
}

export interface ImageSummary {
  id: string;
  repoTag: string;
  repoTags: string[];
  sizeMb: number;
  createdAt: string;
  inUse: boolean;
}

export interface VolumeSummary {
  name: string;
  driver: string;
  mountpoint: string;
  inUse: boolean;
}

export interface ComposeService {
  containerId: string;
  name: string;
  status: ContainerStatus;
  image: string;
  ports: string[];
}

export interface ComposeProject {
  name: string;
  configPath: string;
  services: ComposeService[];
}

export interface LogLine {
  containerId: string;
  containerName: string;
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
}

export type EngineState =
  | "ready"
  | "stopped"
  | "notInstalled"
  | "restartRequired"
  | "wslUnavailable"
  | "unsupported"
  | "error";

export interface EngineStatus {
  state: EngineState;
  distro?: string;
  message: string;
  logs: string[];
}

export interface Settings {
  stopEngineOnExit: boolean;
  engineDistro?: string;
}

export interface DaemonInfo {
  connected: boolean;
  managed: boolean;
  version: string;
  containersRunning: number;
  containersStopped: number;
  images: number;
  imagesSizeMb: number;
  cpus: number;
  memTotalMb: number;
  /** Share of the host CPU used by the running containers, 0-100. */
  cpuPercent: number;
  memUsedMb: number;
}
