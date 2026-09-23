import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Square, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { Meter } from "@/components/ui/Meter";
import { BackLink } from "@/components/ui/BackLink";
import { DetailField } from "@/components/ui/DetailField";
import { cn } from "@/lib/utils";
import { listContainers, listRecentLogs, removeContainer, restartContainer, startContainer, stopContainer } from "@/lib/api";

const tabs = ["Overview", "Logs", "Inspect"] as const;

export function ContainerDetail() {
  const { id } = useParams();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: containers } = useQuery({ queryKey: ["containers"], queryFn: listContainers });
  const { data: logs } = useQuery({ queryKey: ["logs"], queryFn: listRecentLogs });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["containers"] });
    queryClient.invalidateQueries({ queryKey: ["daemon-info"] });
    queryClient.invalidateQueries({ queryKey: ["logs"] });
  };
  const startMutation = useMutation({ mutationFn: startContainer, onSettled: invalidate, meta: { label: "Start container" } });
  const stopMutation = useMutation({ mutationFn: stopContainer, onSettled: invalidate, meta: { label: "Stop container" } });
  const restartMutation = useMutation({ mutationFn: restartContainer, onSettled: invalidate, meta: { label: "Restart container" } });
  const removeMutation = useMutation({
    mutationFn: removeContainer,
    onSuccess: () => navigate("/containers"),
    onSettled: invalidate,
    meta: { label: "Remove container" },
  });
  const busy = startMutation.isPending || stopMutation.isPending || restartMutation.isPending || removeMutation.isPending;

  const container = containers?.find((c) => c.id === id);
  const containerLogs = (logs ?? []).filter((l) => l.containerId === id);

  if (!container) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink to="/containers">Back to containers</BackLink>
        <p className="text-sm text-text-muted">Container not found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <BackLink to="/containers">Back to containers</BackLink>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{container.name}</h1>
          <p className="mt-1 text-sm text-text-muted">{container.image}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={container.status} />
          <div className="flex items-center gap-1.5">
            {container.status === "running" ? (
              <Button disabled={busy} onClick={() => stopMutation.mutate(container.id)}>
                <Square size={14} />
                Stop
              </Button>
            ) : (
              <Button variant="primary" disabled={busy} onClick={() => startMutation.mutate(container.id)}>
                <Play size={14} />
                Start
              </Button>
            )}
            <Button disabled={busy} onClick={() => restartMutation.mutate(container.id)}>
              <RotateCw size={14} />
              Restart
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Remove container "${container.name}"? It is stopped first if it is running.`)) {
                  removeMutation.mutate(container.id);
                }
              }}
            >
              <Trash2 size={14} />
              Remove
            </Button>
          </div>
        </div>
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
                {container.memUsageMb.toFixed(0)} MB / {container.memLimitMb.toFixed(0)} MB
              </p>
            </div>
            <DetailField label="Ports">{container.ports.join(", ") || "—"}</DetailField>
            <DetailField label="Created">{new Date(container.createdAt).toLocaleString()}</DetailField>
            <DetailField label="Image">
              {container.imageId ? (
                <Link
                  to={`/images/${encodeURIComponent(container.imageId)}`}
                  className="text-accent hover:underline"
                  title="Open image"
                >
                  {container.image}
                </Link>
              ) : (
                container.image
              )}
            </DetailField>
            {container.project && (
              <DetailField label="Compose project">
                <Link
                  to={`/compose/${encodeURIComponent(container.project)}`}
                  className="text-accent hover:underline"
                  title="Open compose project"
                >
                  {container.project}
                </Link>
              </DetailField>
            )}
            {container.volumes.length > 0 && (
              <DetailField label="Volumes" className="sm:col-span-2">
                <div className="flex flex-col gap-1">
                  {container.volumes.map((volume) => (
                    <Link
                      key={volume}
                      to={`/volumes/${encodeURIComponent(volume)}`}
                      className="truncate text-accent hover:underline"
                      title={volume}
                    >
                      {volume}
                    </Link>
                  ))}
                </div>
              </DetailField>
            )}
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
            <pre className="overflow-x-auto rounded-control bg-surface-hover p-4 font-mono text-xs text-text-secondary">
              {JSON.stringify(container, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
