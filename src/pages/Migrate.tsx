import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Boxes,
  Check,
  HardDrive,
  Layers,
  Link2,
  Loader2,
  RefreshCw,
  Server,
  type LucideIcon,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { MigrationQueue } from "@/components/migrate/MigrationQueue";
import { getEngineContents, listEngines, startMigration } from "@/lib/api";
import { useMigrations } from "@/lib/migrations";
import { containerKey, imageKey, imageLabel, relatedKeys, resolvePlan, volumeKey } from "@/lib/migrationPlan";
import { toast } from "@/lib/toast";
import { cn, errorMessage, formatBytes } from "@/lib/utils";
import type { EngineContents, EngineInfo, MigrationMode } from "@/lib/types";

const selectClass =
  "h-9 w-full rounded-control border border-border bg-surface px-3 text-sm text-text-primary shadow-inset";

function EngineCard({
  role,
  engines,
  value,
  onChange,
  contents,
  failed,
}: {
  role: string;
  engines: EngineInfo[];
  value: string;
  onChange: (kind: string) => void;
  contents?: EngineContents;
  failed?: boolean;
}) {
  const engine = engines.find((e) => e.kind === value);
  return (
    <Card className="flex min-w-0 flex-1 flex-col gap-3 p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-tile bg-accent/10 text-accent">
          <Server size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{role}</p>
          <p className="truncate text-sm font-semibold text-text-primary">
            {engine?.label ?? "Choose an engine"}
            {engine && <span className="ml-2 text-xs font-normal text-text-muted">Docker {engine.version}</span>}
          </p>
        </div>
      </div>
      <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value)} aria-label={role}>
        {engines.map((e) => (
          <option key={e.kind} value={e.kind}>
            {e.label}
          </option>
        ))}
      </select>
      <p className="text-xs text-text-muted">
        {contents
          ? `${contents.containers.length} containers, ${contents.images.length} images, ${contents.volumes.length} volumes`
          : failed
            ? "Could not read this engine."
            : "Reading..."}
      </p>
    </Card>
  );
}

type TileState = "idle" | "picked" | "needed";

function Tile({
  icon: Icon,
  title,
  subtitle,
  state,
  linked,
  onDestination,
  neededBy,
  onClick,
  onHover,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: ReactNode;
  state: TileState;
  linked: boolean;
  onDestination: boolean;
  neededBy: string[];
  onClick: () => void;
  onHover: (hovering: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      aria-pressed={state !== "idle"}
      className={cn(
        "flex w-full items-center gap-3 rounded-control border px-3 py-2 text-left transition-colors",
        state === "picked" && "border-accent bg-accent/10",
        state === "needed" && "border-dashed border-accent bg-accent/5",
        state === "idle" && (linked ? "border-accent/60 bg-surface-hover" : "border-border hover:bg-surface-hover")
      )}
    >
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-control border",
          state === "idle" ? "border-border text-transparent" : "border-accent bg-accent text-accent-foreground"
        )}
      >
        {state === "needed" ? <Link2 size={12} /> : <Check size={12} />}
      </span>
      <Icon size={15} className="shrink-0 text-text-muted" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text-primary" title={title}>
          {title}
        </span>
        <span className="block truncate text-xs text-text-muted">
          {state === "needed" && neededBy.length > 0 ? `Needed by ${neededBy.join(", ")}` : subtitle}
        </span>
      </span>
      {onDestination && (
        <span className="shrink-0 rounded-pill border border-border bg-surface-hover px-2 py-0.5 text-xs text-text-secondary">
          Already there
        </span>
      )}
    </button>
  );
}

function Column({
  title,
  icon: Icon,
  count,
  onSelectAll,
  children,
}: {
  title: string;
  icon: LucideIcon;
  count: number;
  onSelectAll: () => void;
  children: ReactNode;
}) {
  return (
    <Card className="flex min-w-0 flex-col overflow-hidden">
      <CardHeader className="py-3">
        <CardTitle className="flex items-center gap-2">
          <Icon size={15} className="text-text-muted" />
          {title}
          <span className="text-xs font-normal text-text-muted">{count}</span>
        </CardTitle>
        {count > 0 && (
          <Button variant="ghost" size="sm" onClick={onSelectAll}>
            Select all
          </Button>
        )}
      </CardHeader>
      <div className="flex max-h-96 flex-col gap-1.5 overflow-y-auto px-3 pb-3">
        {count === 0 ? <p className="py-6 text-center text-xs text-text-muted">Nothing here.</p> : children}
      </div>
    </Card>
  );
}

export function Migrate() {
  const {
    data: engines,
    isPending,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({ queryKey: ["engines"], queryFn: listEngines, refetchInterval: 10000 });
  const { data: jobs } = useMigrations();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [mode, setMode] = useState<MigrationMode>("copy");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState<string | null>(null);

  // Start with the first two engines that answer; keep the choice while it stays reachable.
  useEffect(() => {
    if (!engines || engines.length < 2) return;
    const kinds: string[] = engines.map((e) => e.kind);
    const nextFrom = kinds.includes(from) ? from : kinds[0];
    const nextTo = kinds.includes(to) && to !== nextFrom ? to : (kinds.find((k) => k !== nextFrom) ?? "");
    if (nextFrom !== from) setFrom(nextFrom);
    if (nextTo !== to) setTo(nextTo);
  }, [engines, from, to]);

  const ready = !!engines && engines.length >= 2 && !!from && !!to && from !== to;
  const { data: source, isError: sourceFailed } = useQuery({
    queryKey: ["engine-contents", from],
    queryFn: () => getEngineContents(from),
    enabled: ready,
  });
  const { data: destination, isError: destinationFailed } = useQuery({
    queryKey: ["engine-contents", to],
    queryFn: () => getEngineContents(to),
    enabled: ready,
  });

  const plan = useMemo(() => (source ? resolvePlan(picked, source, destination) : new Map()), [picked, source, destination]);
  const related = useMemo(
    () => (source && hovered ? relatedKeys(hovered, source) : new Set<string>()),
    [source, hovered]
  );
  const projects = useMemo(() => {
    const byProject = new Map<string, string[]>();
    for (const c of source?.containers ?? []) {
      if (c.project) byProject.set(c.project, [...(byProject.get(c.project) ?? []), containerKey(c.id)]);
    }
    return [...byProject.entries()];
  }, [source]);

  const toggle = (key: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const addAll = (keys: string[]) => setPicked((prev) => new Set([...prev, ...keys]));
  const changeSource = (kind: string) => {
    setFrom(kind);
    setPicked(new Set());
  };
  const swap = () => {
    setFrom(to);
    setTo(from);
    setPicked(new Set());
  };

  const tileProps = (key: string) => {
    const item = plan.get(key);
    const state: TileState = picked.has(key) ? "picked" : item ? "needed" : "idle";
    return {
      state,
      linked: related.has(key),
      onDestination: item?.onDestination ?? false,
      neededBy: item?.neededBy ?? [],
      onClick: () => toggle(key),
      onHover: (hovering: boolean) => setHovered(hovering ? key : null),
    };
  };

  const items = [...plan.values()];
  const toSend = items.filter((i) => !i.onDestination);
  const duplicates = items.length - toSend.length;
  const counts = {
    container: toSend.filter((i) => i.kind === "container").length,
    image: toSend.filter((i) => i.kind === "image").length,
    volume: toSend.filter((i) => i.kind === "volume").length,
  };
  const imageSizeMb = toSend
    .filter((i) => i.kind === "image")
    .reduce((sum, i) => sum + (source?.images.find((img) => img.id === i.id)?.sizeMb ?? 0), 0);
  const runningPicked = toSend.filter(
    (i) => i.kind === "container" && source?.containers.find((c) => c.id === i.id)?.status === "running"
  ).length;
  const label = (kind: string) => engines?.find((e) => e.kind === kind)?.label ?? kind;

  const start = useMutation({
    mutationFn: () =>
      startMigration({
        from,
        to,
        fromLabel: label(from),
        toLabel: label(to),
        mode,
        items: toSend.map((i) => ({ kind: i.kind, id: i.id, label: i.label })),
      }),
    onSuccess: () => {
      setPicked(new Set());
      toast.success("Migration queued", "It runs in the background; follow it in the queue below.");
    },
    meta: { label: "Start migration" },
  });

  const onStart = () => {
    if (
      mode === "move" &&
      !window.confirm(
        `Move ${toSend.length} item${toSend.length === 1 ? "" : "s"} from ${label(from)} to ${label(to)}?\n\n` +
          "Running containers are stopped, and what was copied successfully is removed from the source."
      )
    ) {
      return;
    }
    start.mutate();
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Migrate</h1>
        <p className="mt-1 text-sm text-text-muted">
          Copy or move containers, images and volumes from one engine to another. Pick what you want: what it depends on
          follows.
        </p>
      </div>

      {isPending ? (
        <div className="flex justify-center py-10 text-text-muted">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : !engines || engines.length < 2 ? (
        <Card>
          <EmptyState
            icon={ArrowLeftRight}
            title="Two engines are needed"
            description={`${
              isError
                ? `Looking for engines failed: ${errorMessage(error)}`
                : engines?.length
                ? `Only ${engines[0].label} answers right now.`
                : "No Docker engine answers right now."
            } Start a second one (for example Docker Desktop next to the WSL engine, or add an endpoint under Other... in the top bar) to migrate from one to the other. The engines are checked every few seconds.`}
          />
          <div className="flex justify-center pb-8">
            <Button onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw size={14} className={isFetching ? "animate-spin" : undefined} />
              Check again
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
            <EngineCard role="From" engines={engines} value={from} onChange={changeSource} contents={source} failed={sourceFailed} />
            <div className="flex shrink-0 flex-col items-center gap-2 self-center">
              <Button variant="ghost" size="icon" onClick={swap} aria-label="Swap source and destination">
                <ArrowLeftRight size={16} />
              </Button>
              <div className="inline-flex rounded-control border border-border p-0.5" role="group" aria-label="Mode">
                {(["copy", "move"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => setMode(m)}
                    className={cn(
                      "rounded-control px-3 py-1 text-xs font-medium capitalize transition-colors",
                      mode === m ? "bg-accent text-accent-foreground" : "text-text-secondary hover:bg-surface-hover"
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <EngineCard role="To" engines={engines} value={to} onChange={setTo} contents={destination} failed={destinationFailed} />
          </div>

          {projects.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-text-muted">Compose projects:</span>
              {projects.map(([name, keys]) => (
                <Button key={name} variant="secondary" size="sm" onClick={() => addAll(keys)}>
                  {name}
                  <span className="text-text-muted">{keys.length}</span>
                </Button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Column
              title="Containers"
              icon={Boxes}
              count={source?.containers.length ?? 0}
              onSelectAll={() => addAll((source?.containers ?? []).map((c) => containerKey(c.id)))}
            >
              {source?.containers.map((c) => (
                <Tile
                  key={c.id}
                  icon={Boxes}
                  title={c.name}
                  subtitle={`${c.status} - ${c.image}`}
                  {...tileProps(containerKey(c.id))}
                />
              ))}
            </Column>
            <Column
              title="Images"
              icon={Layers}
              count={source?.images.length ?? 0}
              onSelectAll={() => addAll((source?.images ?? []).map((i) => imageKey(i.id)))}
            >
              {source?.images.map((i) => (
                <Tile
                  key={i.id}
                  icon={Layers}
                  title={imageLabel(source, i.id)}
                  subtitle={formatBytes(i.sizeMb)}
                  {...tileProps(imageKey(i.id))}
                />
              ))}
            </Column>
            <Column
              title="Volumes"
              icon={HardDrive}
              count={source?.volumes.length ?? 0}
              onSelectAll={() => addAll((source?.volumes ?? []).map((v) => volumeKey(v.name)))}
            >
              {source?.volumes.map((v) => (
                <Tile
                  key={v.name}
                  icon={HardDrive}
                  title={v.name}
                  subtitle={v.inUse ? "In use" : "Not used"}
                  {...tileProps(volumeKey(v.name))}
                />
              ))}
            </Column>
          </div>

          <Card className="flex flex-col gap-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0 text-sm">
                {items.length === 0 ? (
                  <span className="text-text-muted">Pick containers, images or volumes above.</span>
                ) : (
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-text-primary">
                    <span className="font-medium">{mode === "move" ? "Move" : "Copy"}</span>
                    {counts.container > 0 && <span>{counts.container} container{counts.container === 1 ? "" : "s"}</span>}
                    {counts.image > 0 && <span>{counts.image} image{counts.image === 1 ? "" : "s"} ({formatBytes(imageSizeMb)})</span>}
                    {counts.volume > 0 && <span>{counts.volume} volume{counts.volume === 1 ? "" : "s"}</span>}
                    <ArrowRight size={13} className="text-text-muted" />
                    <span>{label(to)}</span>
                  </span>
                )}
              </div>
              <Button variant="primary" size="md" onClick={onStart} disabled={toSend.length === 0 || start.isPending}>
                {mode === "move" ? "Queue move" : "Queue copy"}
              </Button>
            </div>
            {duplicates > 0 && (
              <p className="text-xs text-text-muted">
                {duplicates} item{duplicates === 1 ? " is" : "s are"} already on the destination and will be left alone
                {mode === "move" ? ", and kept on the source" : ""}.
              </p>
            )}
            {runningPicked > 0 && (
              <p className="flex items-start gap-1.5 text-xs text-warning">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                {mode === "move"
                  ? `${runningPicked} running container${runningPicked === 1 ? " will" : "s will"} be stopped first so its data is copied consistently.`
                  : `${runningPicked} running container${runningPicked === 1 ? " is" : "s are"} selected: data written while copying may end up inconsistent. Stop them first if it matters.`}
              </p>
            )}
            {items.length > 0 && (
              <p className="text-xs text-text-muted">
                Containers are created on the destination without being started. Custom networks are not migrated.
              </p>
            )}
          </Card>
        </>
      )}

      <MigrationQueue jobs={jobs ?? []} />
    </div>
  );
}
