import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "icon";
}

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-accent text-accent-foreground hover:bg-accent-hover",
  secondary: "bg-surface-hover text-text-primary border border-border hover:bg-border",
  ghost: "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
  danger: "text-danger hover:bg-danger/10",
};

const sizes: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  icon: "h-8 w-8 justify-center",
};

export function Button({ className, variant = "secondary", size = "sm", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center rounded-control font-medium shadow-control transition-colors active:shadow-inset disabled:opacity-40 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
