import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Square, RotateCw, Trash2, Boxes } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/SearchInput";
import { Meter } from "@/components/ui/Meter";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConnectionError } from "@/components/ui/ConnectionError";
import { SortableTh } from "@/components/ui/SortableTh";
import { listContainers, removeContainer, restartContainer, startContainer, stopContainer } from "@/lib/api";
import { useSort } from "@/lib/sort";
import type { ContainerSummary } from "@/lib/types";
import { containerStatusScore as statusScore } from "@/lib/utils";
import { Link } from "react-router-dom";

const columns = {
  name: (c: ContainerSummary) => c.name,
  image: (c: ContainerSummary) => c.image,
  status: (c: ContainerSummary) => statusScore[c.status],
  cpu: (c: ContainerSummary) => c.cpuPercent,
  memory: (c: ContainerSummary) => c.memUsageMb,
  ports: (c: ContainerSummary) => parseInt(c.ports[0] ?? "", 10) || 0,
};

/** Default order: running containers on top, the rest keeps Docker's order. */
const runningFirst = (a: ContainerSummary, b: ContainerSummary) => statusScore[b.status] - statusScore[a.status];

export function Containers() {
  const [query, setQuery] = useState("");
  const { sort, toggle, sortRows } = useSort(columns, runningFirst);
  const queryClient = useQueryClient();
  const {
    data: containers,
    isError,
    error,
  } = useQuery({ queryKey: ["containers"], queryFn: listContainers, refetchInterval: 5000 });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["containers"] });
    queryClient.invalidateQueries({ queryKey: ["daemon-info"] });
  };
  const startMutation = useMutation({ mutationFn: startContainer, onSettled: invalidate, meta: { label: "Start container" } });
  const stopMutation = useMutation({ mutationFn: stopContainer, onSettled: invalidate, meta: { label: "Stop container" } });
  const restartMutation = useMutation({ mutationFn: restartContainer, onSettled: invalidate, meta: { label: "Restart container" } });
  const removeMutation = useMutation({ mutationFn: removeContainer, onSettled: invalidate, meta: { label: "Remove container" } });

  const filtered = useMemo(() => {
    const list = containers ?? [];
    if (!query.trim()) return sortRows(list);
    const q = query.toLowerCase();
    return sortRows(list.filter((c) => c.name.toLowerCase().includes(q) || c.image.toLowerCase().includes(q)));
  }, [containers, query, sortRows]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Containers</h1>
          <p className="mt-1 text-sm text-text-muted">{containers?.length ?? 0} total</p>
        </div>
        <SearchInput
          placeholder="Filter containers..."
          className="w-64"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <Card className="overflow-hidden">
        {isError ? (
          <ConnectionError error={error} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Boxes} title="No containers found" description="Try adjusting your search." />
        ) : (
          <table className="w-full table-fixed text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-text-muted">
                <SortableTh label="Name" column="name" sort={sort} onSort={toggle} className="w-[18%]" />
                <SortableTh label="Image" column="image" sort={sort} onSort={toggle} className="w-[22%]" />
                <SortableTh label="Status" column="status" sort={sort} onSort={toggle} className="w-[11%]" />
                <SortableTh label="CPU" column="cpu" sort={sort} onSort={toggle} className="w-[11%]" />
                <SortableTh label="Memory" column="memory" sort={sort} onSort={toggle} className="w-[13%]" />
                <SortableTh label="Ports" column="ports" sort={sort} onSort={toggle} className="w-[15%]" />
                <th className="w-[10%] px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((c) => {
                const running = c.status === "running";
                const busy =
                  startMutation.isPending || stopMutation.isPending || restartMutation.isPending || removeMutation.isPending;
                return (
                  <tr key={c.id} className="transition-colors hover:bg-surface-hover">
                    <td className="truncate px-5 py-3">
                      <Link
                        to={`/containers/${c.id}`}
                        className="block truncate font-medium text-text-primary hover:text-accent hover:underline"
                        title={c.name}
                      >
                        {c.name}
                      </Link>
                      <p className="truncate text-xs text-text-muted">{c.statusText}</p>
                    </td>
                    <td className="truncate px-5 py-3 text-text-secondary" title={c.image}>
                      {c.image}
                    </td>
                    <td className="px-5 py-3">
                      <StatusPill status={c.status} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="w-16">
                        <Meter percent={c.cpuPercent} />
                        <p className="mt-1 text-xs text-text-muted">{c.cpuPercent.toFixed(1)}%</p>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="w-20">
                        <Meter percent={c.memPercent} />
                        <p className="mt-1 text-xs text-text-muted">{c.memUsageMb.toFixed(0)} MB</p>
                      </div>
                    </td>
                    <td className="truncate px-5 py-3 text-xs text-text-secondary" title={c.ports.join(", ")}>
                      {c.ports.length ? c.ports.join(", ") : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {running ? (
                          <Button variant="ghost" size="icon" disabled={busy} onClick={() => stopMutation.mutate(c.id)} title="Stop">
                            <Square size={14} />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="icon" disabled={busy} onClick={() => startMutation.mutate(c.id)} title="Start">
                            <Play size={14} />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" disabled={busy} onClick={() => restartMutation.mutate(c.id)} title="Restart">
                          <RotateCw size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={busy}
                          onClick={() => removeMutation.mutate(c.id)}
                          title="Remove"
                          className="hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
