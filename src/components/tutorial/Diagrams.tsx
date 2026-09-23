import type { CSSProperties, ReactNode } from "react";

/* Animated schemas for the tutorials. Plain SVG styled with theme tokens (fill-*, stroke-*), animated by the
   `diagram-*` classes in index.css, which switch off under prefers-reduced-motion. */

type Tone = "neutral" | "accent";

function Diagram({ label, children }: { label: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 640 220" role="img" aria-label={label} className="h-auto w-full">
      {children}
    </svg>
  );
}

function Node({
  x,
  y,
  w = 140,
  h = 70,
  title,
  sub,
  tone = "neutral",
  style,
  className,
}: {
  x: number;
  y: number;
  w?: number;
  h?: number;
  title: string;
  sub?: string;
  tone?: Tone;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <g style={style} className={className}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx="10"
        className={tone === "accent" ? "fill-accent stroke-accent" : "fill-surface-hover stroke-border"}
        fillOpacity={tone === "accent" ? 0.12 : 1}
      />
      <text
        x={x + w / 2}
        y={y + h / 2 - (sub ? 3 : -5)}
        textAnchor="middle"
        fontSize="15"
        fontWeight="600"
        className="fill-text-primary"
      >
        {title}
      </text>
      {sub && (
        <text x={x + w / 2} y={y + h / 2 + 17} textAnchor="middle" fontSize="11" className="fill-text-muted">
          {sub}
        </text>
      )}
    </g>
  );
}

function Link({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} strokeDasharray="4 4" className="stroke-border" strokeWidth="2" />;
}

function Packet({ x, y, dx, delay = 0, dur = 3 }: { x: number; y: number; dx: number; delay?: number; dur?: number }) {
  return (
    <circle
      cx={x}
      cy={y}
      r="6"
      className="diagram-slide fill-accent"
      style={{ "--dx": `${dx}px`, "--dur": `${dur}s`, animationDelay: `${delay}s` } as CSSProperties}
    />
  );
}

function Caption({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <text x={x} y={y} textAnchor="middle" fontSize="12" className="fill-text-secondary">
      {children}
    </text>
  );
}

/** Registry -> image -> container. */
export function OverviewDiagram() {
  return (
    <Diagram label="An image is pulled from a registry, then run as a container">
      <Node x={20} y={75} title="Registry" sub="Docker Hub, GHCR..." />
      <Node x={250} y={75} title="Image" sub="read-only template" />
      <Node x={480} y={75} title="Container" sub="running process" tone="accent" />
      <Link x1={160} y1={110} x2={250} y2={110} />
      <Link x1={390} y1={110} x2={480} y2={110} />
      <Packet x={165} y={110} dx={80} />
      <Packet x={395} y={110} dx={80} delay={1.5} />
      <Caption x={205} y={70}>docker pull</Caption>
      <Caption x={435} y={70}>docker run</Caption>
      <Caption x={320} y={190}>One image can start many identical containers.</Caption>
    </Diagram>
  );
}

/** Stacked read-only layers with the writable one on top. */
export function LayersDiagram() {
  const layers = [
    { title: "FROM node:20-slim", sub: "base OS + Node" },
    { title: "COPY package.json", sub: "dependencies list" },
    { title: "RUN npm install", sub: "node_modules" },
    { title: "COPY . .", sub: "your source code" },
  ];
  return (
    <Diagram label="An image is a stack of read-only layers; a container adds a thin writable layer on top">
      <Node
        x={40}
        y={14}
        w={300}
        h={30}
        title="Container layer (writable)"
        tone="accent"
        className="diagram-blink"
        style={{ "--dur": "3s" } as CSSProperties}
      />
      <text x={360} y={34} fontSize="11" className="fill-text-muted">
        thrown away with the container
      </text>
      {layers.map((layer, i) => (
        <g key={layer.title}>
          <Node
            x={40}
            y={172 - i * 42}
            w={300}
            h={36}
            title={layer.title}
            className="diagram-drop"
            style={{ "--dur": "6s", animationDelay: `${i * 0.5}s` } as CSSProperties}
          />
          <text x={360} y={195 - i * 42} fontSize="11" className="fill-text-muted">
            {layer.sub}
          </text>
        </g>
      ))}
    </Diagram>
  );
}

/** created -> running -> exited -> removed, with the current step highlighted in a loop. */
export function LifecycleDiagram() {
  const steps = [
    { title: "Created", cmd: "docker create" },
    { title: "Running", cmd: "docker start" },
    { title: "Exited", cmd: "docker stop" },
    { title: "Removed", cmd: "docker rm" },
  ];
  const width = 120;
  const gap = 50;
  const start = (640 - (steps.length * width + (steps.length - 1) * gap)) / 2;
  return (
    <Diagram label="A container goes from created to running, then exited, then removed">
      {steps.map((step, i) => {
        const x = start + i * (width + gap);
        return (
          <g key={step.title}>
            <Node x={x} y={70} w={width} h={60} title={step.title} />
            <rect
              x={x}
              y={70}
              width={width}
              height={60}
              rx="10"
              className={`diagram-cycle-${i} fill-accent stroke-accent`}
              fillOpacity="0.2"
              style={{ "--dur": "8s" } as CSSProperties}
            />
            {i > 0 && (
              <>
                <line x1={x - gap + 6} y1={100} x2={x - 6} y2={100} className="stroke-border" strokeWidth="2" />
                <text x={x - gap / 2} y={90} textAnchor="middle" fontSize="10" className="fill-text-muted">
                  {step.cmd.replace("docker ", "")}
                </text>
              </>
            )}
          </g>
        );
      })}
      <Caption x={320} y={175}>docker run = create + start. Exited containers keep their data until removed.</Caption>
    </Diagram>
  );
}

/** Containers writing into a volume that outlives them. */
export function VolumesDiagram() {
  return (
    <Diagram label="Containers write to a volume that lives on after they are removed">
      <Node x={20} y={30} w={170} h={64} title="Container A" sub="/var/lib/data" />
      <Node x={20} y={126} w={170} h={64} title="Container B" sub="/backup" />
      <Node x={450} y={60} w={170} h={100} title="Volume" sub="managed by Docker" tone="accent" />
      <Link x1={190} y1={66} x2={450} y2={66} />
      <Link x1={190} y1={154} x2={450} y2={154} />
      <Packet x={200} y={66} dx={230} dur={3.4} />
      <Packet x={200} y={154} dx={230} delay={1.6} dur={3.4} />
      <Caption x={320} y={210}>docker rm deletes the container, the volume and its data stay.</Caption>
    </Diagram>
  );
}

/** localhost:8080 forwarded to the container's port 80. */
export function PortsDiagram() {
  return (
    <Diagram label="A request to a host port is forwarded to a port inside the container">
      <rect x={20} y={40} width={600} height={130} rx="12" fill="none" strokeDasharray="6 5" className="stroke-border" strokeWidth="2" />
      <text x={36} y={62} fontSize="11" className="fill-text-muted">
        Your machine
      </text>
      <Node x={45} y={85} title="Browser" sub="localhost:8080" />
      <Node x={250} y={85} w={130} title="Host port" sub="8080" />
      <Node x={445} y={85} title="Container" sub="nginx listens on 80" tone="accent" />
      <Link x1={185} y1={120} x2={250} y2={120} />
      <Link x1={380} y1={120} x2={445} y2={120} />
      <Packet x={190} y={120} dx={50} />
      <Packet x={385} y={120} dx={50} delay={1} />
      <Caption x={320} y={196}>docker run -p 8080:80 nginx (host port : container port)</Caption>
    </Diagram>
  );
}

/** A compose file starting services that talk over a shared network. */
export function ComposeDiagram() {
  return (
    <Diagram label="A compose file starts several services that talk over one network">
      <Node x={20} y={75} w={150} title="compose.yaml" sub="docker compose up" />
      <Link x1={170} y1={110} x2={260} y2={110} />
      <Packet x={175} y={110} dx={70} />
      <rect x={260} y={20} width={360} height={180} rx="12" fill="none" strokeDasharray="6 5" className="stroke-border" strokeWidth="2" />
      <text x={276} y={40} fontSize="11" className="fill-text-muted">
        Shared network (services reach each other by name)
      </text>
      <Node x={280} y={62} w={100} h={50} title="web" tone="accent" />
      <Node x={500} y={62} w={100} h={50} title="api" tone="accent" />
      <Node x={390} y={136} w={100} h={50} title="db" tone="accent" />
      <Link x1={380} y1={87} x2={500} y2={87} />
      <Link x1={550} y1={112} x2={470} y2={136} />
      <Packet x={385} y={87} dx={105} dur={2.6} />
    </Diagram>
  );
}
