import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export interface ChartPoint {
  t: number;
  /** Percentage, 0-100. */
  value: number;
  /** Extra line shown in the tooltip. */
  note?: string;
}

interface UsageChartProps {
  /** What is plotted, for assistive technology ("CPU usage"). */
  label: string;
  points: ChartPoint[];
  windowMs: number;
  className?: string;
}

/** Samples further apart than this (the poll pauses when the window is in the background) are not joined. */
const GAP_MS = 15_000;
/** Possible tops of the y axis; each has a round half, which is the middle gridline. */
const TOPS = [4, 10, 20, 50, 100];

const percent = (v: number) => `${v.toFixed(1)}%`;

/** One series over time: a 2px line over a faint wash, hairline grid, crosshair tooltip on hover or arrow keys. */
export function UsageChart({ label, points, windowMs, className }: UsageChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const plot = useRef<HTMLDivElement>(null);

  const end = points.length ? points[points.length - 1].t : 0;
  const start = end - windowMs;

  const visible = useMemo(() => points.filter((p) => p.t >= start), [points, start]);
  const peak = visible.reduce((m, p) => Math.max(m, p.value), 0);
  const top = TOPS.find((t) => t >= peak * 1.15) ?? 100;

  const x = (t: number) => ((t - start) / windowMs) * 100;
  const y = (v: number) => 100 - (Math.min(v, top) / top) * 100;

  const { line, area } = useMemo(() => {
    const segments: ChartPoint[][] = [];
    for (const p of visible) {
      const last = segments[segments.length - 1];
      if (last && p.t - last[last.length - 1].t <= GAP_MS) last.push(p);
      else segments.push([p]);
    }
    const drawn = segments.filter((s) => s.length > 1);
    const path = (s: ChartPoint[]) => s.map((p, i) => `${i ? "L" : "M"}${x(p.t)} ${y(p.value)}`).join(" ");
    return {
      line: drawn.map(path).join(" "),
      area: drawn.map((s) => `${path(s)} L${x(s[s.length - 1].t)} 100 L${x(s[0].t)} 100 Z`).join(" "),
    };
  }, [visible, start, windowMs, top]);

  const hovered = hover !== null ? visible[hover] : undefined;
  const latest = visible[visible.length - 1];

  const moveTo = (clientX: number) => {
    const rect = plot.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || visible.length === 0) return;
    const target = start + ((clientX - rect.left) / rect.width) * windowMs;
    let best = 0;
    for (let i = 1; i < visible.length; i++) {
      if (Math.abs(visible[i].t - target) < Math.abs(visible[best].t - target)) best = i;
    }
    setHover(best);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (visible.length === 0) return;
    if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? visible.length) - 1));
    else if (e.key === "ArrowRight") setHover((h) => Math.min(visible.length - 1, (h ?? visible.length - 2) + 1));
    else return;
    e.preventDefault();
  };

  const average = visible.length ? visible.reduce((s, p) => s + p.value, 0) / visible.length : 0;
  const summary = latest
    ? `${label}, last ${Math.round(windowMs / 60000)} minutes: now ${percent(latest.value)}, average ${percent(average)}, peak ${percent(peak)}.`
    : `${label}: no data yet.`;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex h-40 py-2">
        <div className="relative w-10 shrink-0 text-xs text-text-muted" aria-hidden>
          {[0, 50, 100].map((pos) => (
            <span key={pos} className="absolute right-2 -translate-y-1/2" style={{ top: `${pos}%` }}>
              {Math.round(top - (top * pos) / 100)}%
            </span>
          ))}
        </div>

        <div
          ref={plot}
          role="group"
          aria-label={label}
          tabIndex={0}
          className="relative flex-1 touch-none"
          onPointerMove={(e) => moveTo(e.clientX)}
          onPointerLeave={() => setHover(null)}
          onBlur={() => setHover(null)}
          onKeyDown={onKeyDown}
        >
          <span className="sr-only">{summary}</span>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
            {[0, 50, 100].map((pos) => (
              <line
                key={pos}
                x1="0"
                x2="100"
                y1={pos}
                y2={pos}
                className="stroke-border"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {area && <path d={area} className="fill-accent" fillOpacity="0.1" />}
            {line && (
              <path
                d={line}
                className="fill-none stroke-accent"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {visible.length === 0 && (
            <p className="absolute inset-0 flex items-center justify-center text-xs text-text-muted">Collecting data...</p>
          )}

          {/* The end of the line, or the point under the pointer: a 8px dot inside a surface-colored ring. */}
          {(hovered ?? latest) && (
            <span
              className="pointer-events-none absolute flex h-3 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-surface-solid"
              style={{ left: `${x((hovered ?? latest)!.t)}%`, top: `${y((hovered ?? latest)!.value)}%` }}
            >
              <span className="h-2 w-2 rounded-full bg-accent" />
            </span>
          )}

          {hovered && (
            <>
              <span
                className="pointer-events-none absolute bottom-0 top-0 w-px bg-border"
                style={{ left: `${x(hovered.t)}%` }}
              />
              <div
                className={cn(
                  "pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-control border bg-surface-solid px-3 py-2 text-xs shadow-overlay",
                  x(hovered.t) > 60 ? "-translate-x-full -ml-3" : "ml-3"
                )}
                style={{ left: `${x(hovered.t)}%` }}
              >
                <p className="text-sm font-semibold text-text-primary">{percent(hovered.value)}</p>
                {hovered.note && <p className="text-text-secondary">{hovered.note}</p>}
                <p className="text-text-muted">{new Date(hovered.t).toLocaleTimeString()}</p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex justify-between pl-10 text-xs text-text-muted" aria-hidden>
        <span>{Math.round(windowMs / 60000)} min ago</span>
        <span>now</span>
      </div>
    </div>
  );
}
