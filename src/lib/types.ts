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
  cpuPercent: number;
  memPercent: number;
  memUsageMb: number;
  memLimitMb: number;
}

export interface ImageSummary {
  id: string;
  repoTag: string;
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

export interface DaemonInfo {
  connected: boolean;
  version: string;
  containersRunning: number;
  containersStopped: number;
  images: number;
  imagesSizeMb: number;
}
