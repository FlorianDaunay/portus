import { themeToStyle, type Theme } from "@/themes";

/**
 * A miniature of the app drawn with `theme`'s own tokens: the variables are scoped to this
 * element, so colors, corner radii, borders, shadows and the font are all shown for real.
 */
export function ThemePreview({ theme }: { theme: Theme }) {
  return (
    <div
      aria-hidden
      style={themeToStyle(theme)}
      className="pointer-events-none flex h-24 select-none overflow-hidden rounded-tile border bg-canvas font-sans text-text-primary"
    >
      <div className="flex w-9 shrink-0 flex-col gap-1.5 border-r bg-surface p-1.5">
        <div className="h-3 w-3 rounded-control bg-accent" />
        <div className="h-1.5 w-full rounded-pill bg-accent/30" />
        <div className="h-1.5 w-3/4 rounded-pill bg-surface-hover" />
        <div className="h-1.5 w-2/3 rounded-pill bg-surface-hover" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-2">
        <div className="h-1.5 w-1/3 rounded-pill bg-text-primary" />
        <div className="flex flex-1 flex-col justify-between rounded-card border bg-surface p-1.5 shadow-card">
          <div className="space-y-1">
            <div className="h-1 w-2/3 rounded-pill bg-text-secondary" />
            <div className="h-1 w-1/2 rounded-pill bg-text-muted" />
          </div>
          <div className="flex items-center justify-between gap-1">
            <span className="flex items-center gap-0.5 rounded-pill border bg-surface-hover px-1 text-[6px] leading-3 text-success">
              <span className="h-1 w-1 rounded-full bg-success" />
              Running
            </span>
            <span className="rounded-control bg-accent px-1.5 text-[6px] leading-3 text-accent-foreground">Start</span>
          </div>
        </div>
      </div>
    </div>
  );
}
