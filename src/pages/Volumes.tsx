import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HardDrive, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/SearchInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConnectionError } from "@/components/ui/ConnectionError";
import { listVolumes, removeVolume } from "@/lib/api";

export function Volumes() {
  const [query, setQuery] = useState("");
  const queryClient = useQueryClient();
  const { data: volumes, isError, error } = useQuery({ queryKey: ["volumes"], queryFn: listVolumes });
  const removeMutation = useMutation({
    mutationFn: removeVolume,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["volumes"] }),
  });

  const filtered = useMemo(() => {
    const list = volumes ?? [];
    if (!query.trim()) return list;
    return list.filter((v) => v.name.toLowerCase().includes(query.toLowerCase()));
  }, [volumes, query]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Volumes</h1>
          <p className="mt-1 text-sm text-text-muted">{volumes?.length ?? 0} total</p>
        </div>
        <SearchInput placeholder="Filter volumes..." className="w-64" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <Card className="overflow-hidden">
        {isError ? (
          <ConnectionError error={error} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={HardDrive} title="No volumes found" />
        ) : (
          <table className="w-full table-fixed text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-text-muted">
                <th className="w-[22%] px-5 py-3 font-medium">Name</th>
                <th className="w-[10%] px-5 py-3 font-medium">Driver</th>
                <th className="w-[46%] px-5 py-3 font-medium">Mountpoint</th>
                <th className="w-[12%] px-5 py-3 font-medium">In use</th>
                <th className="w-[10%] px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((v) => (
                <tr key={v.name} className="transition-colors hover:bg-surface-hover">
                  <td className="truncate px-5 py-3">
                    <p className="truncate font-medium text-text-primary" title={v.name}>
                      {v.name}
                    </p>
                  </td>
                  <td className="px-5 py-3 text-text-secondary">{v.driver}</td>
                  <td className="truncate px-5 py-3 text-xs text-text-muted" title={v.mountpoint}>
                    {v.mountpoint}
                  </td>
                  <td className="px-5 py-3">
                    {v.inUse ? (
                      <span className="text-xs font-medium text-success">In use</span>
                    ) : (
                      <span className="text-xs text-text-muted">Unused</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={v.inUse || removeMutation.isPending}
                        onClick={() => removeMutation.mutate(v.name)}
                        title={v.inUse ? "Cannot remove: volume in use" : "Remove"}
                        className="hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
