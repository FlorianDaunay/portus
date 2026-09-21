import { useCallback, useState } from "react";

export type SortDir = "asc" | "desc";
export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

type Value = string | number;

function compareValues(a: Value, b: Value): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Column sorting for a table. Clicking a column cycles descending -> ascending -> back to the
 * default order (`fallback`, which is also the tie-breaker so the default grouping survives).
 * Pass `columns` and `fallback` from module scope so `sortRows` stays stable between renders.
 */
export function useSort<T, K extends string>(columns: Record<K, (row: T) => Value>, fallback: (a: T, b: T) => number) {
  const [sort, setSort] = useState<SortState<K> | null>(null);

  const toggle = useCallback((key: K) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "desc" };
      return prev.dir === "desc" ? { key, dir: "asc" } : null;
    });
  }, []);

  const sortRows = useCallback(
    (rows: T[]): T[] => {
      const sorted = [...rows];
      if (!sort) return sorted.sort(fallback);
      const value = columns[sort.key];
      const sign = sort.dir === "asc" ? 1 : -1;
      return sorted.sort((a, b) => sign * compareValues(value(a), value(b)) || fallback(a, b));
    },
    [sort, columns, fallback]
  );

  return { sort, toggle, sortRows };
}
