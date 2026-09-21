import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DetailField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-xs text-text-muted">{label}</p>
      <div className="mt-1 break-words text-sm">{children}</div>
    </div>
  );
}
