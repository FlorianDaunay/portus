import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { removeRegistry, saveRegistry, testRegistry } from "@/lib/api";
import { toast } from "@/lib/toast";
import type { RegistryInfo, RegistryKind } from "@/lib/types";

const inputClass =
  "h-9 w-full rounded-control border border-border bg-surface px-3 text-sm text-text-primary shadow-inset placeholder:text-text-muted";

export const kindLabels: Record<RegistryKind, string> = {
  hub: "Docker Hub",
  ghcr: "GitHub Container Registry",
  gitlab: "GitLab Container Registry",
  custom: "Other registry",
};

const secretHints: Record<RegistryKind, string> = {
  hub: "Docker Hub username and an access token (Account settings > Personal access tokens). Browsing public images needs no login.",
  ghcr: "GitHub username and a personal access token with the read:packages scope (write:packages to push).",
  gitlab:
    "GitLab username and a personal, deploy or group token with read_registry (write_registry to push). Self-managed GitLab: use your registry address.",
  custom: "Address of the registry (for example registry.example.com or localhost:5000) and, if it needs one, a login.",
};

interface Props {
  /** The registry being edited, or `null` to create a new one. */
  registry: RegistryInfo | null;
  onSaved: (list: RegistryInfo[], id?: string) => void;
  onRemoved: (list: RegistryInfo[]) => void;
}

export function RegistryForm({ registry, onSaved, onRemoved }: Props) {
  const [kind, setKind] = useState<RegistryKind>(registry?.kind ?? "ghcr");
  const [name, setName] = useState(registry?.name ?? "");
  const [host, setHost] = useState(registry && registry.kind !== "hub" ? registry.host : "");
  const [username, setUsername] = useState(registry?.username ?? "");
  // Empty keeps the saved password; the backend never sends it back.
  const [password, setPassword] = useState("");
  const [tested, setTested] = useState(false);
  const isHub = registry?.kind === "hub";
  const fixedHost = kind === "hub" || kind === "ghcr";

  const save = useMutation({
    mutationFn: () =>
      saveRegistry({
        id: registry?.id,
        name,
        kind,
        host,
        username,
        password: password === "" ? undefined : password,
      }),
    onSuccess: (list) => {
      setPassword("");
      setTested(false);
      // A new registry is the last entry.
      onSaved(list, registry ? registry.id : list[list.length - 1]?.id);
      toast.success("Registry saved");
    },
    meta: { label: "Save registry" },
  });

  const test = useMutation({
    mutationFn: async () => {
      const list = await saveRegistry({
        id: registry?.id,
        name,
        kind,
        host,
        username,
        password: password === "" ? undefined : password,
      });
      const id = registry?.id ?? list[list.length - 1]?.id;
      await testRegistry(id);
      return { list, id };
    },
    onSuccess: ({ list, id }) => {
      setPassword("");
      setTested(true);
      onSaved(list, id);
    },
    meta: { label: "Test registry" },
  });

  const remove = useMutation({
    mutationFn: () => removeRegistry(registry!.id),
    onSuccess: onRemoved,
    meta: { label: "Remove registry" },
  });

  const busy = save.isPending || test.isPending || remove.isPending;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {!isHub && (
        <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
          Type
          <select
            className={inputClass}
            value={kind}
            onChange={(e) => setKind(e.target.value as RegistryKind)}
            disabled={!!registry}
          >
            {(["ghcr", "gitlab", "custom"] as const).map((k) => (
              <option key={k} value={k}>
                {kindLabels[k]}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="text-xs text-text-muted">{secretHints[kind]}</p>
      {!isHub && (
        <>
          <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
            Name (optional)
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder={kindLabels[kind]} />
          </label>
          {!fixedHost && (
            <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
              Address
              <input
                className={inputClass}
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder={kind === "gitlab" ? "registry.gitlab.com" : "registry.example.com:5000"}
                spellCheck={false}
                autoComplete="off"
              />
            </label>
          )}
        </>
      )}
      <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
        Username
        <input
          className={inputClass}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
        Password or token
        <input
          type="password"
          className={inputClass}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={registry?.hasPassword ? "Saved (leave empty to keep it)" : ""}
          autoComplete="new-password"
        />
      </label>
      <p className="text-xs text-text-muted">
        The token is stored on this computer in Portus's data folder, unencrypted, and is only sent to this registry.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={busy}>
          {save.isPending && <Loader2 size={13} className="animate-spin" />}
          Save
        </Button>
        <Button type="button" disabled={busy} onClick={() => test.mutate()}>
          {test.isPending && <Loader2 size={13} className="animate-spin" />}
          Save and test
        </Button>
        {tested && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
            <CheckCircle2 size={13} /> Connected
          </span>
        )}
        {registry && !isHub && (
          <Button type="button" variant="danger" disabled={busy} className="ml-auto" onClick={() => remove.mutate()}>
            Remove
          </Button>
        )}
      </div>
    </form>
  );
}
