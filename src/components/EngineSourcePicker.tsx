import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Server } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EngineEndpointForm } from "@/components/EngineEndpointForm";
import { getDaemonInfo, getSettings, setEngineSource } from "@/lib/api";
import { cn, isWindows } from "@/lib/utils";
import type { EngineSource } from "@/lib/types";

const options: Array<{ value: EngineSource; label: string; description: string; windowsOnly?: boolean }> = [
  {
    value: "auto",
    label: "Automatic",
    description: "Use whichever engine answers: the local one first, then WSL.",
  },
  {
    value: "desktop",
    label: "Docker Desktop",
    description: "Docker Desktop or any Docker daemon on this machine's default socket.",
  },
  {
    value: "wsl",
    label: "WSL",
    description: "The Docker Engine Portus installs and manages inside WSL, no Docker Desktop needed.",
    windowsOnly: true,
  },
  {
    value: "custom",
    label: "Other...",
    description: "Any endpoint you provide: Colima, OrbStack, a remote host...",
  },
];

const kindLabel = { local: "Local", wsl: "WSL", custom: "Other" } as const;

/** Chooses which Docker engine Portus talks to. Lives in the top bar. */
export function EngineSourcePicker() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const { data: info } = useQuery({ queryKey: ["daemon-info"], queryFn: getDaemonInfo, refetchInterval: 5000 });
  const source = settings?.engineSource ?? "auto";
  // Picking "Other..." reveals the form; the source only changes once an endpoint is submitted.
  const [editingCustom, setEditingCustom] = useState(false);

  const select = useMutation({
    mutationFn: (value: EngineSource) => setEngineSource(value),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setOpen(false);
    },
    meta: { label: "Switch Docker engine" },
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) setEditingCustom(source === "custom");
  }, [open, source]);

  const current = options.find((o) => o.value === source) ?? options[0];
  const label =
    source === "auto" && info?.source ? `Automatic (${kindLabel[info.source]})` : current.label.replace("...", "");

  return (
    <div ref={rootRef} className="relative">
      <Button variant="ghost" size="sm" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Server size={15} />
        <span className="hidden sm:inline">{label}</span>
      </Button>

      {open && (
        <div
          role="dialog"
          aria-labelledby={titleId}
          className="absolute left-0 top-full z-40 mt-2 w-[26rem] max-w-[calc(100vw-2rem)] animate-fade-in rounded-card border bg-surface-solid shadow-overlay"
        >
          <div className="border-b px-5 py-4">
            <h2 id={titleId} className="text-sm font-semibold text-text-primary">
              Docker engine
            </h2>
            <p className="mt-0.5 text-xs text-text-muted">Choose which Docker Portus connects to.</p>
          </div>
          <div role="radiogroup" aria-label="Docker engine" className="flex flex-col gap-1 p-2">
            {options
              .filter((o) => !o.windowsOnly || isWindows)
              .map((o) => {
                const selected = o.value === "custom" ? editingCustom : !editingCustom && source === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={select.isPending}
                    onClick={() => {
                      if (o.value === "custom") setEditingCustom(true);
                      else {
                        setEditingCustom(false);
                        select.mutate(o.value);
                      }
                    }}
                    className={cn(
                      "flex items-start justify-between gap-3 rounded-control px-3 py-2 text-left transition-colors hover:bg-surface-hover",
                      selected && "bg-surface-hover"
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-text-primary">{o.label}</span>
                      <span className="block text-xs text-text-muted">{o.description}</span>
                    </span>
                    {selected && <Check size={14} className="mt-1 shrink-0 text-accent" />}
                  </button>
                );
              })}
          </div>
          {editingCustom && (
            <div className="border-t px-5 py-4">
              <EngineEndpointForm onSaved={() => setOpen(false)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
