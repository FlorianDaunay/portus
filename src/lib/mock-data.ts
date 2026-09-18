import type {
  ComposeProject,
  ContainerSummary,
  DaemonInfo,
  ImageSummary,
  LogLine,
  VolumeSummary,
} from "./types";

export const mockContainers: ContainerSummary[] = [
  {
    id: "a1b2c3d4e5f6",
    name: "portus-api",
    image: "portus/api:1.4.0",
    status: "running",
    statusText: "Up 3 hours",
    ports: ["8080:8080"],
    createdAt: "2026-09-15T09:12:00Z",
    project: "portus-stack",
    cpuPercent: 4.2,
    memPercent: 18,
    memUsageMb: 184,
    memLimitMb: 1024,
  },
  {
    id: "b2c3d4e5f6a7",
    name: "portus-db",
    image: "postgres:16-alpine",
    status: "running",
    statusText: "Up 3 hours",
    ports: ["5432:5432"],
    createdAt: "2026-09-15T09:11:40Z",
    project: "portus-stack",
    cpuPercent: 1.1,
    memPercent: 32,
    memUsageMb: 328,
    memLimitMb: 1024,
  },
  {
    id: "c3d4e5f6a7b8",
    name: "portus-cache",
    image: "redis:7-alpine",
    status: "running",
    statusText: "Up 3 hours",
    ports: ["6379:6379"],
    createdAt: "2026-09-15T09:11:45Z",
    project: "portus-stack",
    cpuPercent: 0.4,
    memPercent: 6,
    memUsageMb: 42,
    memLimitMb: 700,
  },
  {
    id: "d4e5f6a7b8c9",
    name: "nginx-proxy",
    image: "nginx:1.27",
    status: "running",
    statusText: "Up 2 days",
    ports: ["80:80", "443:443"],
    createdAt: "2026-09-13T11:00:00Z",
    cpuPercent: 0.2,
    memPercent: 3,
    memUsageMb: 18,
    memLimitMb: 512,
  },
  {
    id: "e5f6a7b8c9d0",
    name: "batch-worker",
    image: "portus/worker:0.9.2",
    status: "restarting",
    statusText: "Restarting (1) 12 seconds ago",
    ports: [],
    createdAt: "2026-09-16T20:03:00Z",
    cpuPercent: 0,
    memPercent: 0,
    memUsageMb: 0,
    memLimitMb: 512,
  },
  {
    id: "f6a7b8c9d0e1",
    name: "old-migration-job",
    image: "portus/migrate:0.3.0",
    status: "exited",
    statusText: "Exited (0) 5 hours ago",
    ports: [],
    createdAt: "2026-09-16T15:00:00Z",
    cpuPercent: 0,
    memPercent: 0,
    memUsageMb: 0,
    memLimitMb: 256,
  },
  {
    id: "07a8b9c0d1e2",
    name: "docs-site",
    image: "nginx:1.25-alpine",
    status: "paused",
    statusText: "Paused",
    ports: ["4000:80"],
    createdAt: "2026-09-14T08:20:00Z",
    cpuPercent: 0,
    memPercent: 2,
    memUsageMb: 9,
    memLimitMb: 256,
  },
];

export const mockImages: ImageSummary[] = [
  { id: "sha256:1a2b3c", repoTag: "portus/api:1.4.0", sizeMb: 128, createdAt: "2026-09-15T08:00:00Z", inUse: true },
  { id: "sha256:2b3c4d", repoTag: "postgres:16-alpine", sizeMb: 241, createdAt: "2026-08-02T10:00:00Z", inUse: true },
  { id: "sha256:3c4d5e", repoTag: "redis:7-alpine", sizeMb: 41, createdAt: "2026-07-20T10:00:00Z", inUse: true },
  { id: "sha256:4d5e6f", repoTag: "nginx:1.27", sizeMb: 187, createdAt: "2026-09-01T10:00:00Z", inUse: true },
  { id: "sha256:5e6f7a", repoTag: "nginx:1.25-alpine", sizeMb: 43, createdAt: "2026-06-11T10:00:00Z", inUse: true },
  { id: "sha256:6f7a8b", repoTag: "portus/worker:0.9.2", sizeMb: 96, createdAt: "2026-09-16T19:50:00Z", inUse: true },
  { id: "sha256:7a8b9c", repoTag: "portus/migrate:0.3.0", sizeMb: 88, createdAt: "2026-08-28T10:00:00Z", inUse: false },
  { id: "sha256:8b9c0d", repoTag: "ubuntu:24.04", sizeMb: 78, createdAt: "2026-05-14T10:00:00Z", inUse: false },
  { id: "sha256:9c0d1e", repoTag: "<none>:<none>", sizeMb: 512, createdAt: "2026-04-02T10:00:00Z", inUse: false },
];

export const mockVolumes: VolumeSummary[] = [
  { name: "portus-stack_db-data", driver: "local", mountpoint: "/var/lib/docker/volumes/portus-stack_db-data/_data", sizeMb: 1840, inUse: true },
  { name: "portus-stack_cache-data", driver: "local", mountpoint: "/var/lib/docker/volumes/portus-stack_cache-data/_data", sizeMb: 64, inUse: true },
  { name: "nginx-certs", driver: "local", mountpoint: "/var/lib/docker/volumes/nginx-certs/_data", sizeMb: 4, inUse: true },
  { name: "legacy-uploads", driver: "local", mountpoint: "/var/lib/docker/volumes/legacy-uploads/_data", sizeMb: 3200, inUse: false },
];

export const mockCompose: ComposeProject[] = [
  {
    name: "portus-stack",
    configPath: "~/projects/portus/docker-compose.yml",
    services: [
      { name: "portus-api", status: "running", image: "portus/api:1.4.0", ports: ["8080:8080"] },
      { name: "portus-db", status: "running", image: "postgres:16-alpine", ports: ["5432:5432"] },
      { name: "portus-cache", status: "running", image: "redis:7-alpine", ports: ["6379:6379"] },
    ],
  },
  {
    name: "batch-jobs",
    configPath: "~/projects/batch/docker-compose.yml",
    services: [
      { name: "batch-worker", status: "restarting", image: "portus/worker:0.9.2", ports: [] },
      { name: "old-migration-job", status: "exited", image: "portus/migrate:0.3.0", ports: [] },
    ],
  },
];

const levels: LogLine["level"][] = ["info", "info", "info", "warn", "info", "error"];
const sampleMessages = [
  "Listening on 0.0.0.0:8080",
  "Handled GET /api/containers in 12ms",
  "Connection pool: 8/20 in use",
  "Retrying upstream connection (attempt 2)",
  "Cache miss for key user:4821",
  "Failed to reach dependency 'metrics-collector': timeout after 5s",
  "Health check OK",
  "Received SIGTERM, shutting down gracefully",
];

export const mockLogs: LogLine[] = Array.from({ length: 40 }).map((_, i) => {
  const container = mockContainers[i % 3];
  return {
    id: `log-${i}`,
    containerId: container.id,
    containerName: container.name,
    timestamp: new Date(Date.now() - (40 - i) * 4000).toISOString(),
    level: levels[i % levels.length],
    message: sampleMessages[i % sampleMessages.length],
  };
});

export const mockDaemonInfo: DaemonInfo = {
  connected: true,
  version: "27.3.1",
  containersRunning: mockContainers.filter((c) => c.status === "running").length,
  containersStopped: mockContainers.filter((c) => c.status !== "running").length,
  images: mockImages.length,
  diskUsageMb: mockImages.reduce((a, b) => a + b.sizeMb, 0) + mockVolumes.reduce((a, b) => a + b.sizeMb, 0),
};
