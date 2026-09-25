import { useEffect, useId, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { createContainer } from "@/lib/api";
import { toast } from "@/lib/toast";
import type { ImageSummary } from "@/lib/types";

const inputClass =
  "h-9 w-full rounded-control border border-border bg-surface px-3 text-sm text-text-primary shadow-inset placeholder:text-text-muted";
const areaClass =
  "w-full rounded-control border border-border bg-surface px-3 py-2 font-mono text-xs text-text-primary shadow-inset placeholder:text-text-muted";

/** The reference the container is created from: a tag when the image has one, else its id. */
function imageReference(image: ImageSummary) {
  const tag = (image.repoTags.length ? image.repoTags : [image.repoTag]).find((t) => t && !t.includes("<none>"));
  return tag ?? image.id;
}

const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/** Modal form that creates (and optionally starts) a container from an image. */
export function CreateContainerDialog({ image, onClose }: { image: ImageSummary; onClose: () => void }) {
  const titleId = useId();
  const startId = useId();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [ports, setPorts] = useState("");
  const [env, setEnv] = useState("");
  const [start, setStart] = useState(true);
  const reference = imageReference(image);

  const create = useMutation({
    mutationFn: () =>
      createContainer({ image: reference, name: name.trim() || undefined, ports: lines(ports), env: lines(env), start }),
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["containers"] });
      queryClient.invalidateQueries({ queryKey: ["images"] });
      queryClient.invalidateQueries({ queryKey: ["daemon-info"] });
      toast.success(start ? "Container started" : "Container created", reference);
      onClose();
      navigate(`/containers/${encodeURIComponent(id)}`);
    },
    meta: { label: "Create container" },
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !create.isPending) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, create.isPending]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/70 p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !create.isPending) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={submit}
        className="flex w-full max-w-md animate-fade-in flex-col gap-4 rounded-card border bg-surface-solid p-5 shadow-overlay"
      >
        <div>
          <h2 id={titleId} className="text-base font-semibold text-text-primary">
            Create a container
          </h2>
          <p className="mt-0.5 truncate text-xs text-text-muted" title={reference}>
            From {reference}
          </p>
        </div>

        <label className="flex flex-col gap-1.5 text-xs text-text-muted">
          Name (optional)
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-container"
            spellCheck={false}
            autoComplete="off"
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-text-muted">
          Published ports (one per line: host:container)
          <textarea
            className={areaClass}
            rows={2}
            value={ports}
            onChange={(e) => setPorts(e.target.value)}
            placeholder={"8080:80\n5432:5432/tcp"}
            spellCheck={false}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-text-muted">
          Environment variables (one per line: KEY=value)
          <textarea
            className={areaClass}
            rows={3}
            value={env}
            onChange={(e) => setEnv(e.target.value)}
            placeholder="POSTGRES_PASSWORD=secret"
            spellCheck={false}
          />
        </label>
        <div className="flex items-center justify-between gap-3 text-sm text-text-primary">
          <span id={startId}>Start it right away</span>
          <Switch checked={start} onCheckedChange={setStart} aria-labelledby={startId} />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="md" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={create.isPending}>
            {create.isPending ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
            {create.isPending ? "Creating..." : start ? "Create and start" : "Create"}
          </Button>
        </div>
      </form>
    </div>
  );
}
