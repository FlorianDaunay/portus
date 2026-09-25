import { useMemo, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Network as NetworkIcon } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConnectionError } from "@/components/ui/ConnectionError";
import { Switch } from "@/components/ui/Switch";
import { getNetworkMap } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { NetworkContainer, NetworkNode, PortMapping } from "@/lib/types";

// Layout, in SVG user units (the drawing scales to the card width).
const WIDTH = 960;
const PORT_X = 0;
const PORT_W = 170;
const PORT_H = 40;
const PORT_GAP = 12;
const CONTAINER_X = 330;
const CONTAINER_W = 270;
const CONTAINER_H = 52;
const CONTAINER_GAP = 16;
const NET_X = 760;
const NET_W = 200;
const NET_H = 58;
const NET_GAP = 20;
const TOP = 34;

type Selection = { kind: "container" | "network"; id: string } | null;

interface PortNode {
  key: string;
  port: PortMapping;
  container: string;
  y: number;
}

const wildcard = new Set(["0.0.0.0", "::", ""]);

function trunc(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function curve(x1: number, y1: number, x2: number, y2: number): string {
  const mid = (x1 + x2) / 2;
  return `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`;
}

/** Stacks `count` boxes of `height` with `gap`, returning each top edge. */
function stack(count: number, height: number, gap: number, offset = 0): number[] {
  return Array.from({ length: count }, (_, i) => TOP + offset + i * (height + gap));
}

function activate(action: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      action();
    }
  };
}

interface DiagramProps {
  containers: NetworkContainer[];
  networks: NetworkNode[];
}

function Diagram({ containers, networks }: DiagramProps) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Selection>(null);
  const [hover, setHover] = useState<Selection>(null);
  const focus = hover ?? selected;

  const layout = useMemo(() => {
    const containerY = new Map<string, number>();
    stack(containers.length, CONTAINER_H, CONTAINER_GAP).forEach((y, i) => containerY.set(containers[i].id, y));

    const portNodes: PortNode[] = [];
    for (const c of containers) {
      for (const p of c.ports.filter((p) => p.hostPort != null)) {
        portNodes.push({ key: `${c.id}:${p.hostPort}/${p.protocol}:${p.containerPort}`, port: p, container: c.id, y: 0 });
      }
    }
    stack(portNodes.length, PORT_H, PORT_GAP).forEach((y, i) => (portNodes[i].y = y));

    const networkY = new Map<string, number>();
    stack(networks.length, NET_H, NET_GAP).forEach((y, i) => networkY.set(networks[i].name, y));

    const bottom = (count: number, h: number, gap: number) => (count ? TOP + count * (h + gap) - gap : TOP);
    const height =
      Math.max(
        bottom(containers.length, CONTAINER_H, CONTAINER_GAP),
        bottom(portNodes.length, PORT_H, PORT_GAP),
        bottom(networks.length, NET_H, NET_GAP)
      ) + 8;
    return { containerY, portNodes, networkY, height };
  }, [containers, networks]);

  const related = (kind: "container" | "network", id: string): boolean => {
    if (!focus) return true;
    if (focus.kind === kind) return focus.id === id;
    if (focus.kind === "container") {
      const c = containers.find((c) => c.id === focus.id);
      return kind === "network" && !!c?.networks.some((n) => n.network === id);
    }
    const c = containers.find((c) => c.id === id);
    return !!c?.networks.some((n) => n.network === focus.id);
  };

  const select = (next: Selection) => setSelected((cur) => (cur && next && cur.kind === next.kind && cur.id === next.id ? null : next));

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${layout.height}`}
      className="w-full"
      role="img"
      aria-label="Docker network map: published host ports, containers and the networks they are attached to"
    >
      <g className="fill-text-muted text-[11px] font-medium uppercase tracking-wide">
        <text x={PORT_X} y={14}>Host ports</text>
        <text x={CONTAINER_X} y={14}>Containers</text>
        <text x={NET_X} y={14}>Networks</text>
      </g>

      {/* Edges first so nodes sit on top. */}
      <g fill="none" strokeWidth={1.5}>
        {layout.portNodes.map((p) => {
          const y = layout.containerY.get(p.container) ?? 0;
          const dim = !related("container", p.container);
          return (
            <path
              key={p.key}
              d={curve(PORT_X + PORT_W, p.y + PORT_H / 2, CONTAINER_X, y + CONTAINER_H / 2)}
              className={cn("stroke-accent transition-opacity", dim && "opacity-10")}
            />
          );
        })}
        {containers.flatMap((c) =>
          c.networks.map((n) => {
            const ny = layout.networkY.get(n.network);
            if (ny == null) return null;
            const dim = focus ? !(related("container", c.id) && related("network", n.network)) : false;
            return (
              <path
                key={`${c.id}>${n.network}`}
                d={curve(
                  CONTAINER_X + CONTAINER_W,
                  (layout.containerY.get(c.id) ?? 0) + CONTAINER_H / 2,
                  NET_X,
                  ny + NET_H / 2
                )}
                className={cn(
                  "transition-opacity",
                  c.state === "running" ? "stroke-text-secondary" : "stroke-text-muted",
                  c.state !== "running" && "[stroke-dasharray:4_4]",
                  dim && "opacity-10"
                )}
              />
            );
          })
        )}
      </g>

      {layout.portNodes.map((p) => {
        const host = p.port.hostIp && !wildcard.has(p.port.hostIp) ? `${p.port.hostIp}:` : ":";
        return (
          <g
            key={p.key}
            transform={`translate(${PORT_X} ${p.y})`}
            className={cn("transition-opacity", !related("container", p.container) && "opacity-30")}
          >
            <rect width={PORT_W} height={PORT_H} rx={8} className="fill-accent/10 stroke-accent" />
            <text x={12} y={17} className="fill-text-primary text-[12px] font-semibold">
              {host}
              {p.port.hostPort}
            </text>
            <text x={12} y={32} className="fill-text-secondary text-[11px]">
              → {p.port.containerPort}/{p.port.protocol}
            </text>
          </g>
        );
      })}

      {containers.map((c) => {
        const y = layout.containerY.get(c.id) ?? 0;
        const running = c.state === "running";
        const isSelected = selected?.kind === "container" && selected.id === c.id;
        const exposed = c.ports.filter((p) => p.hostPort == null);
        return (
          <g
            key={c.id}
            transform={`translate(${CONTAINER_X} ${y})`}
            role="link"
            tabIndex={0}
            aria-label={`${c.name}, ${c.state}. Enter to open, Space to highlight its links`}
            className={cn("cursor-pointer transition-opacity", !related("container", c.id) && "opacity-30")}
            onMouseEnter={() => setHover({ kind: "container", id: c.id })}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover({ kind: "container", id: c.id })}
            onBlur={() => setHover(null)}
            onClick={() => select({ kind: "container", id: c.id })}
            onDoubleClick={() => navigate(`/containers/${encodeURIComponent(c.id)}`)}
            onKeyDown={(e) => {
              if (e.key === "Enter") navigate(`/containers/${encodeURIComponent(c.id)}`);
              else activate(() => select({ kind: "container", id: c.id }))(e);
            }}
          >
            <title>{`${c.name} (${c.state}) - double-click to open`}</title>
            <rect
              width={CONTAINER_W}
              height={CONTAINER_H}
              rx={8}
              className={cn("fill-surface-hover", isSelected ? "stroke-accent" : "stroke-border")}
              strokeWidth={isSelected ? 2 : 1}
            />
            <circle cx={16} cy={20} r={4} className={running ? "fill-success" : "fill-text-muted"} />
            <text x={28} y={24} className="fill-text-primary text-[13px] font-semibold">
              {trunc(c.name, 30)}
            </text>
            <text x={28} y={41} className="fill-text-muted text-[11px]">
              {c.project ? `${trunc(c.project, 16)} · ` : ""}
              {exposed.length > 0 ? `exposes ${exposed.map((p) => p.containerPort).slice(0, 4).join(", ")}` : c.state}
            </text>
          </g>
        );
      })}

      {networks.map((n) => {
        const y = layout.networkY.get(n.name) ?? 0;
        const isSelected = selected?.kind === "network" && selected.id === n.name;
        const members = containers.filter((c) => c.networks.some((a) => a.network === n.name)).length;
        return (
          <g
            key={n.id || n.name}
            transform={`translate(${NET_X} ${y})`}
            role="button"
            tabIndex={0}
            aria-label={`Network ${n.name}, ${members} containers`}
            aria-pressed={isSelected}
            className={cn("cursor-pointer transition-opacity", !related("network", n.name) && "opacity-30")}
            onMouseEnter={() => setHover({ kind: "network", id: n.name })}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover({ kind: "network", id: n.name })}
            onBlur={() => setHover(null)}
            onClick={() => select({ kind: "network", id: n.name })}
            onKeyDown={activate(() => select({ kind: "network", id: n.name }))}
          >
            <title>{`${n.name}: ${n.driver}, ${n.scope}${n.subnet ? `, ${n.subnet}` : ""}`}</title>
            <rect
              width={NET_W}
              height={NET_H}
              rx={8}
              className={cn("fill-surface-hover", isSelected ? "stroke-accent" : "stroke-border")}
              strokeWidth={isSelected ? 2 : 1}
            />
            <text x={12} y={20} className="fill-text-primary text-[13px] font-semibold">
              {trunc(n.name, 22)}
            </text>
            <text x={12} y={36} className="fill-text-secondary text-[11px]">
              {n.driver}
              {n.internal ? " · internal" : ""} · {members}
            </text>
            <text x={12} y={51} className="fill-text-muted text-[11px]">
              {n.subnet ? trunc(n.subnet, 26) : n.builtin ? "built in" : "no subnet"}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function Network() {
  const [showStopped, setShowStopped] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);
  const { data, isError, error } = useQuery({ queryKey: ["network-map"], queryFn: getNetworkMap, refetchInterval: 5000 });

  const view = useMemo(() => {
    if (!data) return null;
    const containers = data.containers.filter((c) => showStopped || c.state === "running");
    const used = new Set(containers.flatMap((c) => c.networks.map((n) => n.network)));
    const networks = data.networks.filter((n) => showEmpty || used.has(n.name));
    return { containers, networks, published: containers.reduce((n, c) => n + c.ports.filter((p) => p.hostPort != null).length, 0) };
  }, [data, showStopped, showEmpty]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Network map</h1>
          <p className="mt-1 text-sm text-text-muted">
            {view
              ? `${view.containers.length} containers, ${view.networks.length} networks, ${view.published} published ports`
              : "Published ports, containers and the networks that link them"}
          </p>
        </div>
        <div className="flex items-center gap-5 text-sm text-text-secondary">
          <label className="flex items-center gap-2">
            <Switch checked={showStopped} onCheckedChange={setShowStopped} aria-label="Show stopped containers" />
            Stopped containers
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={showEmpty} onCheckedChange={setShowEmpty} aria-label="Show networks without containers" />
            Empty networks
          </label>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Who can talk to whom</CardTitle>
          <p className="text-xs text-text-muted">
            Containers on the same network reach each other by name. Hover or focus a box to follow its links; double-click a
            container to open it.
          </p>
        </CardHeader>
        <div className="px-5 pb-5">
          {isError ? (
            <ConnectionError error={error} />
          ) : !view || view.containers.length === 0 ? (
            <EmptyState
              icon={NetworkIcon}
              title="Nothing to draw"
              description={showStopped ? "No containers on this engine." : "No running containers. Show stopped containers to see the rest."}
            />
          ) : (
            <Diagram containers={view.containers} networks={view.networks} />
          )}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-text-muted">
        <span className="flex items-center gap-2">
          <svg width="28" height="8" aria-hidden="true">
            <line x1="0" y1="4" x2="28" y2="4" strokeWidth="1.5" className="stroke-accent" />
          </svg>
          Published on the host
        </span>
        <span className="flex items-center gap-2">
          <svg width="28" height="8" aria-hidden="true">
            <line x1="0" y1="4" x2="28" y2="4" strokeWidth="1.5" className="stroke-text-secondary" />
          </svg>
          Attached (running)
        </span>
        <span className="flex items-center gap-2">
          <svg width="28" height="8" aria-hidden="true">
            <line x1="0" y1="4" x2="28" y2="4" strokeWidth="1.5" strokeDasharray="4 4" className="stroke-text-muted" />
          </svg>
          Attached (stopped)
        </span>
      </div>
    </div>
  );
}
