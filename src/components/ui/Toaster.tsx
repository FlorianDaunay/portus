import { CircleCheck, TriangleAlert, X } from "lucide-react";
import { useToastStore } from "@/lib/toast";
import { cn } from "@/lib/utils";

export function Toaster() {
  const { toasts, dismiss } = useToastStore();

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto flex animate-fade-in items-start gap-3 rounded-tile border bg-surface-solid p-4 shadow-overlay",
            t.kind === "error" ? "border-danger/40" : "border-success/40"
          )}
        >
          {t.kind === "error" ? (
            <TriangleAlert size={16} className="mt-0.5 shrink-0 text-danger" />
          ) : (
            <CircleCheck size={16} className="mt-0.5 shrink-0 text-success" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text-primary">{t.title}</p>
            {t.message && <p className="mt-0.5 break-words text-xs text-text-secondary">{t.message}</p>}
          </div>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss notification"
            className="shrink-0 rounded-control p-0.5 text-text-muted hover:bg-surface-hover hover:text-text-primary"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
