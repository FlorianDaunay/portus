import { Link } from "react-router-dom";
import { StatusPill } from "@/components/ui/StatusPill";
import { containerStatusScore } from "@/lib/utils";
import type { ContainerSummary } from "@/lib/types";

/** The containers behind an image, volume... each linking to its detail page; running ones first. */
export function ContainerLinks({ containers, empty }: { containers: ContainerSummary[]; empty: string }) {
  if (containers.length === 0) return <p className="py-6 text-center text-sm text-text-muted">{empty}</p>;

  const sorted = [...containers].sort((a, b) => containerStatusScore[b.status] - containerStatusScore[a.status]);
  return (
    <div className="flex flex-col divide-y divide-border">
      {sorted.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <Link
              to={`/containers/${c.id}`}
              className="block truncate text-sm font-medium text-text-primary hover:text-accent hover:underline"
              title={c.name}
            >
              {c.name}
            </Link>
            <p className="truncate text-xs text-text-muted">{c.statusText}</p>
          </div>
          <StatusPill status={c.status} />
        </div>
      ))}
    </div>
  );
}
