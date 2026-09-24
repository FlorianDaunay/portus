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
  | "unreachable"
  | "wslUnavailable"
  | "unsupported"
  | "error";

export interface EngineStatus {
  state: EngineState;
  distro?: string;
  message: string;
  logs: string[];
}

export type EngineSource = "auto" | "desktop" | "wsl" | "custom";

export interface Settings {
  engineSource: EngineSource;
  customEndpoint?: string;
  customTlsDir?: string;
  stopEngineOnExit: boolean;
  engineDistro?: string;
  keepRunningInBackground: boolean;
  launchAtStartup: boolean;
  startMinimized: boolean;
}

/** An engine that answers right now, whichever one the top bar is set to. */
export interface EngineInfo {
  kind: "local" | "wsl" | "custom";
  label: string;
  version: string;
}

export interface EngineContents {
  containers: ContainerSummary[];
  images: ImageSummary[];
  volumes: VolumeSummary[];
}

export type MigrationKind = "container" | "image" | "volume";
export type MigrationMode = "copy" | "move";
export type MigrationItemStatus = "pending" | "running" | "done" | "skipped" | "failed";
export type MigrationStatus = "queued" | "running" | "done" | "partial" | "failed" | "cancelled" | "interrupted";

export interface MigrationItem {
  kind: MigrationKind;
  id: string;
  label: string;
  status: MigrationItemStatus;
  message: string;
  bytes: number;
  transferred: boolean;
}

export interface MigrationJob {
  id: number;
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  mode: MigrationMode;
  status: MigrationStatus;
  message: string;
  items: MigrationItem[];
  createdAt: string;
  finishedAt?: string;
}

export interface MigrationRequest {
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  mode: MigrationMode;
  items: Array<{ kind: MigrationKind; id: string; label: string }>;
}

export interface DaemonInfo {
  connected: boolean;
  managed: boolean;
  /** Kind of engine answering: "local", "wsl" or "custom" (empty when disconnected). */
  source: "local" | "wsl" | "custom" | "";
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
