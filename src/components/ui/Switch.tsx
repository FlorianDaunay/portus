import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

/** The knob travels exactly its own width, so the switch stays correct at any theme density. */
export function Switch({ checked, onCheckedChange, disabled, ...aria }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-pill p-0.5 transition-colors disabled:opacity-40",
        checked ? "bg-accent" : "bg-border"
      )}
      {...aria}
    >
      <span
        className={cn(
          "h-4 w-4 rounded-pill transition-transform",
          checked ? "translate-x-full bg-accent-foreground" : "translate-x-0 bg-text-muted"
        )}
      />
    </button>
  );
}
