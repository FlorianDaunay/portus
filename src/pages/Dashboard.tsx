import { useQuery } from "@tanstack/react-query";
import { Boxes, Layers, HardDrive, Database } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { getDaemonInfo, listContainers } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import { Link } from "react-router-dom";

export function Dashboard() {
  const { data: info } = useQuery({ queryKey: ["daemon-info"], queryFn: getDaemonInfo, refetchInterval: 5000 });
  const { data: containers } = useQuery({ queryKey: ["containers"], queryFn: listContainers, refetchInterval: 5000 });

  const recent = (containers ?? []).slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-text-muted">Overview of your Docker environment.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Running" value={String(info?.containersRunning ?? "—")} icon={Boxes} tone="success" />
        <StatCard label="Stopped" value={String(info?.containersStopped ?? "—")} icon={Boxes} tone="warning" />
        <StatCard label="Images" value={String(info?.images ?? "—")} icon={Layers} />
        <StatCard
          label="Disk usage"
          value={info ? formatBytes(info.diskUsageMb) : "—"}
          icon={HardDrive}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent containers</CardTitle>
          <Link to="/containers" className="text-xs font-medium text-accent hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {recent.length === 0 && <p className="py-6 text-center text-sm text-text-muted">No containers found.</p>}
          {recent.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text-primary">{c.name}</p>
                <p className="truncate text-xs text-text-muted">{c.image}</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-text-muted">
                <span>{c.statusText}</span>
                <StatusPill status={c.status} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database size={14} className="text-text-muted" />
            Daemon
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-text-muted">Status</dt>
              <dd className="font-medium text-success">{info?.connected ? "Connected" : "Disconnected"}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Engine version</dt>
              <dd className="font-medium">{info?.version ?? "—"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
