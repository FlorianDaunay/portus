import { cn } from "@/lib/utils";

export function Meter({ percent, className }: { percent: number; className?: string }) {
  const tone = percent > 85 ? "bg-danger" : percent > 60 ? "bg-warning" : "bg-accent";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-hover", className)}>
      <div
        className={cn("h-full rounded-full transition-all", tone)}
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}
