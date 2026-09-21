import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Layers, HardDrive, Database, Power, Cpu, MemoryStick } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { UsageChart } from "@/components/ui/UsageChart";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { ConnectionError } from "@/components/ui/ConnectionError";
import { getDaemonInfo, getSettings, listContainers, setStopEngineOnExit, stopEngine } from "@/lib/api";
import { setEngineAutoStartSuppressed } from "@/lib/engineFlags";
import { HISTORY_MS, useMetrics } from "@/lib/metrics";
import { formatBytes } from "@/lib/utils";
import { Link } from "react-router-dom";

function EngineControls() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });

  const toggle = useMutation({
    mutationFn: setStopEngineOnExit,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
    meta: { label: "Save setting" },
  });
  const stop = useMutation({
    mutationFn: stopEngine,
    onSuccess: () => setEngineAutoStartSuppressed(true),
    onSettled: () => queryClient.invalidateQueries(),
    meta: { label: "Stop Docker" },
  });

  const onStop = () => {
    if (window.confirm("Stop Docker? Every running container will be stopped.")) stop.mutate();
  };

  return (
    <div className="mt-5 flex flex-col gap-3 border-t border-border pt-5">
      <p className="text-xs text-text-muted">
        This Docker Engine runs in WSL and is managed by Portus. It keeps running, with its containers, when Portus closes.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
          <Switch
            checked={settings?.stopEngineOnExit ?? false}
            disabled={!settings || toggle.isPending}
            onCheckedChange={(value) => toggle.mutate(value)}
            aria-label="Stop Docker when Portus closes"
          />
          Stop Docker when Portus closes
        </label>
        <Button variant="danger" onClick={onStop} disabled={stop.isPending}>
          <Power size={14} />
          {stop.isPending ? "Stopping..." : "Stop Docker"}
        </Button>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { data: info } = useQuery({ queryKey: ["daemon-info"], queryFn: getDaemonInfo, refetchInterval: 5000 });
  const {
    data: containers,
    isError,
    error,
  } = useQuery({ queryKey: ["containers"], queryFn: listContainers, refetchInterval: 5000 });

  const recent = (containers ?? []).slice(0, 5);

  const samples = useMetrics((s) => s.samples);
  const cpuPoints = useMemo(() => samples.map((s) => ({ t: s.t, value: s.cpu })), [samples]);
  const memPoints = useMemo(
    () =>
      samples.map((s) => ({
        t: s.t,
        value: s.mem,
        note: `${formatBytes(s.memUsedMb)} of ${formatBytes(s.memTotalMb)}`,
      })),
    [samples]
  );
  const memPercent = info && info.memTotalMb > 0 ? (info.memUsedMb / info.memTotalMb) * 100 : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-text-muted">Overview of your Docker environment.</p>
      </div>

      {isError ? (
        <Card>
          <ConnectionError error={error} />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <StatCard label="Running" value={String(info?.containersRunning ?? "—")} icon={Boxes} tone="success" />
            <StatCard label="Stopped" value={String(info?.containersStopped ?? "—")} icon={Boxes} tone="warning" />
            <StatCard label="Images" value={String(info?.images ?? "—")} icon={Layers} />
            <StatCard
              label="Images size"
              value={info ? formatBytes(info.imagesSizeMb) : "—"}
              icon={HardDrive}
            />
            <StatCard
              label="CPU"
              value={info ? `${info.cpuPercent.toFixed(1)}%` : "—"}
              detail={info?.cpus ? `of ${info.cpus} cores` : undefined}
              icon={Cpu}
            />
            <StatCard
              label="Memory"
              value={info ? `${memPercent.toFixed(1)}%` : "—"}
              detail={info?.memTotalMb ? `${formatBytes(info.memUsedMb)} of ${formatBytes(info.memTotalMb)}` : undefined}
              icon={MemoryStick}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>CPU usage</CardTitle>
                <span className="text-xs text-text-muted">Running containers, share of host CPU</span>
              </CardHeader>
              <CardContent>
                <UsageChart label="CPU usage" points={cpuPoints} windowMs={HISTORY_MS} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Memory usage</CardTitle>
                <span className="text-xs text-text-muted">Running containers, share of host memory</span>
              </CardHeader>
              <CardContent>
                <UsageChart label="Memory usage" points={memPoints} windowMs={HISTORY_MS} />
              </CardContent>
            </Card>
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
                  <dd className="font-medium">{info?.version || "—"}</dd>
                </div>
              </dl>
              {info?.managed && <EngineControls />}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
