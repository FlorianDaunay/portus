import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortState } from "@/lib/sort";

interface SortableThProps<K extends string> {
  label: string;
  column: K;
  sort: SortState<K> | null;
  onSort: (column: K) => void;
  className?: string;
}

/** A table header cell that sorts its column on click: descending, ascending, then reset. */
export function SortableTh<K extends string>({ label, column, sort, onSort, className }: SortableThProps<K>) {
  const active = sort?.key === column ? sort.dir : null;
  const Icon = active === "desc" ? ArrowDown : active === "asc" ? ArrowUp : ChevronsUpDown;
  return (
    <th
      className={cn("px-5 py-3 font-medium", className)}
      aria-sort={active === "desc" ? "descending" : active === "asc" ? "ascending" : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-center gap-1 rounded-control transition-colors hover:text-text-primary",
          active && "text-text-primary"
        )}
      >
        {label}
        <Icon size={12} className={cn(!active && "opacity-50")} />
      </button>
    </th>
  );
}
