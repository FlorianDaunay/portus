import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Layers, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/SearchInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConnectionError } from "@/components/ui/ConnectionError";
import { SortableTh } from "@/components/ui/SortableTh";
import { listImages, removeImage } from "@/lib/api";
import { useSort } from "@/lib/sort";
import type { ImageSummary } from "@/lib/types";
import { formatBytes, timeAgo } from "@/lib/utils";

const columns = {
  repoTag: (i: ImageSummary) => i.repoTag,
  size: (i: ImageSummary) => i.sizeMb,
  created: (i: ImageSummary) => new Date(i.createdAt).getTime() || 0,
  inUse: (i: ImageSummary) => Number(i.inUse),
};

/** Default order: images in use on top, the rest keeps Docker's order. */
const inUseFirst = (a: ImageSummary, b: ImageSummary) => Number(b.inUse) - Number(a.inUse);

export function Images() {
  const [query, setQuery] = useState("");
  const { sort, toggle, sortRows } = useSort(columns, inUseFirst);
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
    if (!query.trim()) return sortRows(list);
    return sortRows(list.filter((i) => i.repoTag.toLowerCase().includes(query.toLowerCase())));
  }, [images, query, sortRows]);

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
                <SortableTh label="Repository:Tag" column="repoTag" sort={sort} onSort={toggle} className="w-[42%]" />
                <SortableTh label="Size" column="size" sort={sort} onSort={toggle} className="w-[13%]" />
                <SortableTh label="Created" column="created" sort={sort} onSort={toggle} className="w-[15%]" />
                <SortableTh label="In use" column="inUse" sort={sort} onSort={toggle} className="w-[15%]" />
                <th className="w-[15%] px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((img) => (
                <tr key={img.id} className="transition-colors hover:bg-surface-hover">
                  <td className="truncate px-5 py-3">
                    <Link
                      to={`/images/${encodeURIComponent(img.id)}`}
                      className="block truncate font-medium text-text-primary hover:text-accent hover:underline"
                      title={img.repoTag}
                    >
                      {img.repoTag}
                    </Link>
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
