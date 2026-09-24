import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Check,
  ChevronDown,
  Circle,
  HardDrive,
  Layers,
  Loader2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Meter } from "@/components/ui/Meter";
import { cancelMigration, clearMigrationHistory } from "@/lib/api";
import { isActive } from "@/lib/migrations";
import { cn, timeAgo } from "@/lib/utils";
import type { MigrationItem, MigrationJob, MigrationKind, MigrationStatus } from "@/lib/types";

const kindIcon: Record<MigrationKind, LucideIcon> = { container: Boxes, image: Layers, volume: HardDrive };

const statusStyle: Record<MigrationStatus, { label: string; text: string }> = {
  queued: { label: "Queued", text: "text-text-secondary" },
  running: { label: "Running", text: "text-accent" },
  done: { label: "Done", text: "text-success" },
  partial: { label: "Partly done", text: "text-warning" },
  failed: { label: "Failed", text: "text-danger" },
  cancelled: { label: "Cancelled", text: "text-text-secondary" },
  interrupted: { label: "Interrupted", text: "text-warning" },
};

function formatTransferred(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

function ItemIcon({ status }: { status: MigrationItem["status"] }) {
  switch (status) {
    case "running":
      return <Loader2 size={14} className="animate-spin text-accent" />;
    case "done":
      return <Check size={14} className="text-success" />;
    case "failed":
      return <AlertTriangle size={14} className="text-danger" />;
    case "skipped":
      return <Circle size={14} className="text-text-muted" />;
    default:
      return <Circle size={14} className="text-border" />;
  }
}

function JobCard({ job }: { job: MigrationJob }) {
  const active = isActive(job.status);
  const [open, setOpen] = useState(active);
  const queryClient = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => cancelMigration(job.id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["migrations"] }),
    meta: { label: "Cancel migration" },
  });
  const style = statusStyle[job.status];
  const finished = job.items.filter((i) => i.status !== "pending" && i.status !== "running").length;
  const percent = job.items.length ? (finished / job.items.length) * 100 : 0;

  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <ChevronDown size={14} className={cn("shrink-0 text-text-muted transition-transform", !open && "-rotate-90")} />
          <span className="text-xs text-text-muted">#{job.id}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-text-primary">
            <span className="truncate">{job.fromLabel}</span>
            <ArrowRight size={13} className="shrink-0 text-text-muted" />
            <span className="truncate">{job.toLabel}</span>
          </span>
          <span className="rounded-pill border border-border px-2 py-0.5 text-xs text-text-secondary">
            {job.mode === "move" ? "Move" : "Copy"}
          </span>
        </button>
        <span className={cn("flex items-center gap-1.5 text-xs font-medium", style.text)}>
          {job.status === "running" && <Loader2 size={12} className="animate-spin" />}
          {style.label}
        </span>
        <span className="hidden text-xs text-text-muted sm:inline">{timeAgo(job.finishedAt ?? job.createdAt)}</span>
        {active && (
          <Button variant="danger" size="sm" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            <X size={13} />
            Cancel
          </Button>
        )}
      </div>
      {active && <Meter percent={percent} className="mt-3" />}
      {job.message && !active && <p className="mt-2 pl-7 text-xs text-text-muted">{job.message}</p>}
      {open && (
        <ul className="mt-3 flex flex-col gap-1.5 pl-7">
          {job.items.map((item) => {
            const Icon = kindIcon[item.kind];
            return (
              <li key={`${item.kind}:${item.id}`} className="flex items-start gap-2 text-xs">
                <span className="mt-0.5">
                  <ItemIcon status={item.status} />
                </span>
                <Icon size={13} className="mt-0.5 shrink-0 text-text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-text-primary">{item.label}</span>
                  <span className={cn("ml-2", item.status === "failed" ? "text-danger" : "text-text-muted")}>
                    {item.status === "running" && item.bytes > 0
                      ? `${formatTransferred(item.bytes)} transferred`
                      : item.message}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Queue and history of migrations, newest first; jobs run one after the other in the background. */
export function MigrationQueue({ jobs }: { jobs: MigrationJob[] }) {
  const queryClient = useQueryClient();
  const clear = useMutation({
    mutationFn: clearMigrationHistory,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["migrations"] }),
    meta: { label: "Clear history" },
  });
  const ordered = [...jobs].sort((a, b) => {
    const activity = Number(isActive(b.status)) - Number(isActive(a.status));
    return activity || b.id - a.id;
  });
  const hasHistory = jobs.some((j) => !isActive(j.status));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Queue and history</h2>
        {hasHistory && (
          <Button variant="ghost" size="sm" onClick={() => clear.mutate()} disabled={clear.isPending}>
            Clear history
          </Button>
        )}
      </div>
      <Card className="divide-y divide-border overflow-hidden">
        {ordered.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-text-muted">
            Nothing yet. Migrations run in the background, so you can keep using Portus while they go.
          </p>
        ) : (
          ordered.map((job) => <JobCard key={job.id} job={job} />)
        )}
      </Card>
    </div>
  );
}
