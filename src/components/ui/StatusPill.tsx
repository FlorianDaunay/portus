import { cn } from "@/lib/utils";
import type { ContainerStatus } from "@/lib/types";

const config: Record<ContainerStatus, { label: string; dot: string; text: string }> = {
  running: { label: "Running", dot: "bg-success", text: "text-success" },
  exited: { label: "Exited", dot: "bg-danger", text: "text-danger" },
  paused: { label: "Paused", dot: "bg-warning", text: "text-warning" },
  restarting: { label: "Restarting", dot: "bg-warning", text: "text-warning" },
  created: { label: "Created", dot: "bg-text-muted", text: "text-text-secondary" },
};

export function StatusPill({ status }: { status: ContainerStatus }) {
  const c = config[status];
  const animated = status === "running" || status === "restarting";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface-hover px-2.5 py-1 text-xs font-medium",
        c.text
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", c.dot, animated && "animate-pulse-dot")} />
      {c.label}
    </span>
  );
}
