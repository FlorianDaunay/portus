import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/SearchInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConnectionError } from "@/components/ui/ConnectionError";
import { listImages, removeImage } from "@/lib/api";
import { formatBytes, timeAgo } from "@/lib/utils";

export function Images() {
  const [query, setQuery] = useState("");
  const queryClient = useQueryClient();
  const { data: images, isError, error } = useQuery({ queryKey: ["images"], queryFn: listImages });
  const removeMutation = useMutation({
    mutationFn: removeImage,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["images"] });
      queryClient.invalidateQueries({ queryKey: ["daemon-info"] });
    },
    meta: { label: "Remove image" },
  });

  const filtered = useMemo(() => {
    const list = images ?? [];
    if (!query.trim()) return list;
    return list.filter((i) => i.repoTag.toLowerCase().includes(query.toLowerCase()));
  }, [images, query]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Images</h1>
          <p className="mt-1 text-sm text-text-muted">{images?.length ?? 0} total</p>
        </div>
        <SearchInput placeholder="Filter images..." className="w-64" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <Card className="overflow-hidden">
        {isError ? (
          <ConnectionError error={error} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Layers} title="No images found" />
        ) : (
          <table className="w-full table-fixed text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-text-muted">
                <th className="w-[42%] px-5 py-3 font-medium">Repository:Tag</th>
                <th className="w-[13%] px-5 py-3 font-medium">Size</th>
                <th className="w-[15%] px-5 py-3 font-medium">Created</th>
                <th className="w-[15%] px-5 py-3 font-medium">In use</th>
                <th className="w-[15%] px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((img) => (
                <tr key={img.id} className="transition-colors hover:bg-surface-hover">
                  <td className="truncate px-5 py-3">
                    <p className="truncate font-medium text-text-primary" title={img.repoTag}>
                      {img.repoTag}
                    </p>
                    <p className="truncate text-xs text-text-muted">{img.id.slice(0, 19)}</p>
                  </td>
                  <td className="px-5 py-3 text-text-secondary">{formatBytes(img.sizeMb)}</td>
                  <td className="px-5 py-3 text-text-secondary">{timeAgo(img.createdAt)}</td>
                  <td className="px-5 py-3">
                    {img.inUse ? (
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
                        disabled={img.inUse || removeMutation.isPending}
                        onClick={() => removeMutation.mutate(img.id)}
                        title={img.inUse ? "Cannot remove: image in use" : "Remove"}
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
