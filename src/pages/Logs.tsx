import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { SearchInput } from "@/components/ui/SearchInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConnectionError } from "@/components/ui/ConnectionError";
import { Button } from "@/components/ui/Button";
import { listContainers, listRecentLogs } from "@/lib/api";
import { cn } from "@/lib/utils";

const levelColor: Record<string, string> = {
  info: "text-text-secondary",
  warn: "text-warning",
  error: "text-danger",
};

export function Logs() {
  const [query, setQuery] = useState("");
  const [containerFilter, setContainerFilter] = useState<string>("all");
  const { data: logs, isError, error } = useQuery({ queryKey: ["logs"], queryFn: listRecentLogs, refetchInterval: 4000 });
  const { data: containers } = useQuery({ queryKey: ["containers"], queryFn: listContainers });

  const filtered = useMemo(() => {
    let list = logs ?? [];
    if (containerFilter !== "all") list = list.filter((l) => l.containerId === containerFilter);
    if (query.trim()) list = list.filter((l) => l.message.toLowerCase().includes(query.toLowerCase()));
    return list;
  }, [logs, containerFilter, query]);

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Logs</h1>
          <p className="mt-1 text-sm text-text-muted">Live log stream across containers.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={containerFilter}
            onChange={(e) => setContainerFilter(e.target.value)}
            className="h-9 rounded-control border border-border bg-surface px-3 text-sm text-text-primary shadow-inset"
          >
            <option value="all">All containers</option>
            {(containers ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <SearchInput placeholder="Filter messages..." className="w-56" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <Card className="flex-1 overflow-hidden">
        {isError ? (
          <ConnectionError error={error} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={ScrollText} title="No log lines" description="Logs will appear here as containers emit output." />
        ) : (
          <div className="max-h-[60vh] overflow-y-auto p-4 font-mono text-xs leading-relaxed">
            {filtered.map((line, i) => (
              <div key={`${line.containerId}-${line.timestamp}-${i}`} className="flex gap-3 py-0.5">
                <span className="shrink-0 text-text-muted">{new Date(line.timestamp).toLocaleTimeString()}</span>
                <span className="shrink-0 font-medium text-accent">{line.containerName}</span>
                <span className={cn("whitespace-pre-wrap", levelColor[line.level])}>{line.message}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={() => setQuery("")}>
          Clear filter
        </Button>
      </div>
    </div>
  );
}
