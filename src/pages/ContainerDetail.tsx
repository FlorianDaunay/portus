import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { Meter } from "@/components/ui/Meter";
import { cn } from "@/lib/utils";
import { listContainers, listRecentLogs } from "@/lib/api";

const tabs = ["Overview", "Logs", "Inspect"] as const;

export function ContainerDetail() {
  const { id } = useParams();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const { data: containers } = useQuery({ queryKey: ["containers"], queryFn: listContainers });
  const { data: logs } = useQuery({ queryKey: ["logs"], queryFn: listRecentLogs });

  const container = containers?.find((c) => c.id === id);
  const containerLogs = (logs ?? []).filter((l) => l.containerId === id);

  if (!container) {
    return (
      <div className="flex flex-col gap-4">
        <Link to="/containers" className="flex w-fit items-center gap-1.5 text-sm text-text-muted hover:text-text-primary">
          <ArrowLeft size={14} /> Back to containers
        </Link>
        <p className="text-sm text-text-muted">Container not found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link to="/containers" className="flex w-fit items-center gap-1.5 text-sm text-text-muted hover:text-text-primary">
        <ArrowLeft size={14} /> Back to containers
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{container.name}</h1>
          <p className="mt-1 text-sm text-text-muted">{container.image}</p>
        </div>
        <StatusPill status={container.status} />
      </div>

      <div className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t ? "border-accent text-accent" : "border-transparent text-text-muted hover:text-text-primary"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <Card>
          <CardContent className="grid grid-cols-1 gap-6 pt-5 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs text-text-muted">CPU usage</p>
              <Meter percent={container.cpuPercent} />
              <p className="mt-1 text-xs text-text-secondary">{container.cpuPercent.toFixed(1)}%</p>
            </div>
            <div>
              <p className="mb-1.5 text-xs text-text-muted">Memory usage</p>
              <Meter percent={container.memPercent} />
              <p className="mt-1 text-xs text-text-secondary">
                {container.memUsageMb} MB / {container.memLimitMb} MB
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Ports</p>
              <p className="mt-1 text-sm">{container.ports.join(", ") || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Created</p>
              <p className="mt-1 text-sm">{new Date(container.createdAt).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "Logs" && (
        <Card className="overflow-hidden">
          <div className="max-h-[50vh] overflow-y-auto p-4 font-mono text-xs leading-relaxed">
            {containerLogs.length === 0 && <p className="text-text-muted">No recent log lines for this container.</p>}
            {containerLogs.map((line, i) => (
              <div key={`${line.timestamp}-${i}`} className="flex gap-3 py-0.5">
                <span className="shrink-0 text-text-muted">{new Date(line.timestamp).toLocaleTimeString()}</span>
                <span className="whitespace-pre-wrap text-text-secondary">{line.message}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === "Inspect" && (
        <Card>
          <CardContent className="pt-5">
            <pre className="overflow-x-auto rounded-lg bg-surface-hover p-4 font-mono text-xs text-text-secondary">
              {JSON.stringify(container, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
