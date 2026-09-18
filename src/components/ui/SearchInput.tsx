import { Search } from "lucide-react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function SearchInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn("relative", className)}>
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-text-muted" />
      <input
        className="h-9 w-full rounded-control border border-border bg-surface pl-9 pr-3 text-sm text-text-primary shadow-inset placeholder:text-text-muted"
        {...props}
      />
    </div>
  );
}
