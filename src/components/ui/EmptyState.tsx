import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-hover text-text-muted">
        <Icon size={20} />
      </div>
      <p className="text-sm font-medium text-text-primary">{title}</p>
      {description && <p className="max-w-sm text-xs text-text-muted">{description}</p>}
    </div>
  );
}
