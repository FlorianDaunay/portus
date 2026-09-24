import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listMigrations, onMigrationUpdate } from "@/lib/api";
import { toast } from "@/lib/toast";
import type { MigrationJob, MigrationStatus } from "@/lib/types";

export const isActive = (status: MigrationStatus) => status === "queued" || status === "running";

export function useMigrations() {
  return useQuery({ queryKey: ["migrations"], queryFn: listMigrations });
}

/** Number of migrations queued or running, for the sidebar badge. */
export function useActiveMigrations(): number {
  const { data } = useMigrations();
  return (data ?? []).filter((job) => isActive(job.status)).length;
}

/**
 * Keeps the `["migrations"]` cache in sync with the backend queue, whichever page is open, and
 * announces the end of each job. Mount it once, in the app shell.
 */
export function useMigrationEvents() {
  const queryClient = useQueryClient();
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    onMigrationUpdate((job) => {
      const previous = queryClient.getQueryData<MigrationJob[]>(["migrations"]) ?? [];
      const before = previous.find((j) => j.id === job.id);
      const next = before ? previous.map((j) => (j.id === job.id ? job : j)) : [...previous, job];
      queryClient.setQueryData(["migrations"], next);

      if (before && isActive(before.status) && !isActive(job.status)) {
        const title = `Migration #${job.id} ${job.status === "done" ? "finished" : job.status}`;
        if (job.status === "done") toast.success(title, job.message);
        else toast.error(title, job.message);
        // What lives on each engine has changed.
        queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "migrations" });
      }
    }).then((fn) => {
      if (cancelled) fn();
      else stop = fn;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [queryClient]);
}
