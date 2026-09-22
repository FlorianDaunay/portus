import type { LucideIcon } from "lucide-react";
import { Card } from "./Card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "default" | "success" | "warning" | "danger";
  /** Secondary line under the value. */
  detail?: string;
}

const toneMap: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "text-accent bg-accent/10",
  success: "text-success bg-success/10",
  warning: "text-warning bg-warning/10",
  danger: "text-danger bg-danger/10",
};

export function StatCard({ label, value, icon: Icon, tone = "default", detail }: StatCardProps) {
  return (
    <Card className="flex items-center gap-4 px-5 py-4">
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-tile", toneMap[tone])}>
        <Icon size={18} strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-text-muted">{label}</p>
        <p className="text-xl font-semibold tracking-tight text-text-primary">{value}</p>
        {detail && <p className="truncate text-xs text-text-muted">{detail}</p>}
      </div>
    </Card>
  );
}
