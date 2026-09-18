import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, PlugZap, RefreshCw, TerminalSquare, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { getEngineStatus, installEngine, onEngineLog, startEngine } from "@/lib/api";
import { isEngineAutoStartSuppressed, setEngineAutoStartSuppressed } from "@/lib/engineFlags";
import type { EngineStatus } from "@/lib/types";

type Busy = "checking" | "starting" | "installing" | null;

const busyTitle: Record<Exclude<Busy, null>, string> = {
  checking: "Looking for Docker...",
  starting: "Starting Docker Engine...",
  installing: "Installing Docker Engine in WSL...",
};

const stateTitle: Record<EngineStatus["state"], string> = {
  ready: "Docker is ready",
  stopped: "Docker isn't running",
  notInstalled: "Docker Engine isn't installed",
  wslUnavailable: "WSL2 is required",
  unsupported: "Docker isn't running",
  error: "Couldn't start Docker",
};

function failure(error: unknown): EngineStatus {
  return {
    state: "error",
    message: error instanceof Error ? error.message : String(error),
    logs: [],
  };
}

export function EngineSetup() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [busy, setBusy] = useState<Busy>("checking");
  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  const autoStarted = useRef(false);
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    onEngineLog((line) => setLiveLogs((prev) => [...prev.slice(-199), line])).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: "end" });
  }, [liveLogs]);

  const run = useCallback(
    async (action: Exclude<Busy, null>, fn: () => Promise<EngineStatus>) => {
      setBusy(action);
      if (action !== "checking") {
        setLiveLogs([]);
        setEngineAutoStartSuppressed(false);
      }
      try {
        const next = await fn();
        setStatus(next);
        if (next.state === "ready") queryClient.invalidateQueries();
      } catch (e) {
        setStatus(failure(e));
      } finally {
        setBusy(null);
      }
    },
    [queryClient]
  );

  useEffect(() => {
    (async () => {
      setBusy("checking");
      try {
        const initial = await getEngineStatus();
        setStatus(initial);
        if (initial.state === "ready") {
          queryClient.invalidateQueries();
          setBusy(null);
        } else if (initial.state === "stopped" && !autoStarted.current && !isEngineAutoStartSuppressed()) {
          autoStarted.current = true;
          await run("starting", startEngine);
        } else {
          setBusy(null);
        }
      } catch (e) {
        setStatus(failure(e));
        setBusy(null);
      }
    })();
  }, [queryClient, run]);

  const logs = liveLogs.length > 0 ? liveLogs : status?.logs ?? [];
  const isError = !busy && status?.state === "error";
  const title = busy ? busyTitle[busy] : status ? stateTitle[status.state] : busyTitle.checking;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 pt-10">
      <Card className="flex flex-col items-center gap-4 px-8 py-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-card bg-surface-hover text-text-muted">
          {busy ? (
            <Loader2 size={24} className="animate-spin text-accent" />
          ) : isError ? (
            <TriangleAlert size={24} className="text-danger" />
          ) : (
            <PlugZap size={24} />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {!busy && status && <p className="max-w-lg text-sm text-text-muted">{status.message}</p>}
          {busy === "installing" && (
            <p className="max-w-lg text-sm text-text-muted">
              This runs as root in your WSL distribution and can take a few minutes.
            </p>
          )}
        </div>

        {!busy && status && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {status.state === "notInstalled" && (
              <Button variant="primary" size="md" onClick={() => run("installing", installEngine)}>
                <Download size={15} />
                Install Docker Engine in {status.distro}
              </Button>
            )}
            {status.state === "stopped" && (
              <Button variant="primary" size="md" onClick={() => run("starting", startEngine)}>
                <PlugZap size={15} />
                Start Docker
              </Button>
            )}
            <Button
              variant="secondary"
              size="md"
              onClick={() => run("checking", getEngineStatus)}
            >
              <RefreshCw size={15} />
              Check again
            </Button>
          </div>
        )}
      </Card>

      {logs.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-xs font-medium text-text-muted">
            <TerminalSquare size={13} />
            Engine log
          </div>
          <div className="max-h-64 overflow-y-auto p-4 font-mono text-xs leading-relaxed text-text-secondary">
            {logs.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">
                {line}
              </div>
            ))}
            <div ref={logEnd} />
          </div>
        </Card>
      )}
    </div>
  );
}
