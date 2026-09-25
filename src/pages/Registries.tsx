import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpFromLine, Cloud, Download, Loader2, Plus, Search, Star } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { RegistryForm, kindLabels } from "@/components/registry/RegistryForm";
import {
  listImages,
  listRegistries,
  listRegistryTags,
  onRegistryProgress,
  pullFromRegistry,
  pushToRegistry,
  searchRegistry,
} from "@/lib/api";
import { toast } from "@/lib/toast";
import { cn, errorMessage } from "@/lib/utils";
import type { RegistryInfo, RegistryProgress } from "@/lib/types";

const inputClass =
  "h-9 w-full rounded-control border border-border bg-surface px-3 text-sm text-text-primary shadow-inset placeholder:text-text-muted";

/** `latest` first, then the rest from the newest-looking to the oldest. */
function sortTags(tags: string[]): string[] {
  return [...tags].sort((a, b) => {
    if (a === "latest") return -1;
    if (b === "latest") return 1;
    return b.localeCompare(a, undefined, { numeric: true });
  });
}

/** Live pull / push output: the latest status of each layer. */
function ProgressPanel({ progress }: { progress: RegistryProgress[] | null }) {
  if (!progress) return null;
  const layers = new Map<string, RegistryProgress>();
  for (const p of progress) layers.set(p.id ?? p.status, p);
  const rows = [...layers.values()].slice(-10);
  const head = progress[progress.length - 1];
  return (
    <div className="rounded-control border border-border bg-surface-hover p-3">
      <p className="mb-2 text-xs font-medium text-text-secondary">
        {head.op === "pull" ? "Pulling" : "Pushing"} {head.reference}
      </p>
      <div aria-live="polite" className="space-y-0.5 font-mono text-xs text-text-muted">
        {rows.map((p) => (
          <p key={p.id ?? p.status} className="truncate">
            {p.id ? `${p.id.slice(0, 12)}  ` : ""}
            {p.status}
            {p.progress ? `  ${p.progress}` : ""}
          </p>
        ))}
      </div>
    </div>
  );
}

export function Registries() {
  const queryClient = useQueryClient();
  const { data: registries = [] } = useQuery({ queryKey: ["registries"], queryFn: listRegistries });
  const [selectedId, setSelectedId] = useState("hub");
  const [adding, setAdding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const registry: RegistryInfo | undefined = registries.find((r) => r.id === selectedId) ?? registries[0];

  const [query, setQuery] = useState("");
  const [repository, setRepository] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState("");
  const [progress, setProgress] = useState<RegistryProgress[] | null>(null);

  const [pushSource, setPushSource] = useState("");
  const [pushRepo, setPushRepo] = useState("");
  const [pushTag, setPushTag] = useState("latest");

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    onRegistryProgress((p) => setProgress((cur) => [...(cur ?? []).slice(-300), p])).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const results = useQuery({
    queryKey: ["registry-search", registry?.id, query.trim()],
    queryFn: () => searchRegistry(registry!.id, query),
    enabled: !!registry && (registry.kind === "hub" ? query.trim().length > 1 : true),
    staleTime: 60_000,
    retry: false,
  });

  const tags = useQuery({
    queryKey: ["registry-tags", registry?.id, repository],
    queryFn: () => listRegistryTags(registry!.id, repository!),
    enabled: !!registry && !!repository,
    staleTime: 60_000,
    retry: false,
  });

  const { data: images } = useQuery({ queryKey: ["images"], queryFn: listImages });
  const localTags = useMemo(() => (images ?? []).flatMap((i) => i.repoTags.filter((t) => !t.startsWith("<none>"))), [images]);

  const pull = useMutation({
    mutationFn: (tag: string) => pullFromRegistry(registry!.id, repository!, tag),
    onMutate: () => setProgress([]),
    onSuccess: (reference) => toast.success("Image pulled", reference),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["images"] });
      queryClient.invalidateQueries({ queryKey: ["daemon-info"] });
    },
    meta: { label: "Pull image" },
  });

  const push = useMutation({
    mutationFn: () => pushToRegistry(registry!.id, pushSource, pushRepo, pushTag || "latest"),
    onMutate: () => setProgress([]),
    onSuccess: (reference) => toast.success("Image pushed", reference),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["images"] }),
    meta: { label: "Push image" },
  });

  const openRepository = (name: string) => {
    setRepository(name.trim());
    setTagFilter("");
  };

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    results.refetch();
  };

  const busy = pull.isPending || push.isPending;
  const visibleTags = sortTags(tags.data ?? []).filter((t) => t.toLowerCase().includes(tagFilter.toLowerCase()));
  const prefix = registry && registry.kind !== "hub" ? `${registry.host}/` : "";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Registries</h1>
        <p className="mt-1 text-sm text-text-muted">Find images on Docker Hub or a private registry, pull them, or push your own.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Registries">
        {registries.map((r) => (
          <button
            key={r.id}
            role="tab"
            aria-selected={!adding && r.id === registry?.id}
            onClick={() => {
              setSelectedId(r.id);
              setAdding(false);
              setShowSettings(false);
              setRepository(null);
              setQuery("");
            }}
            className={cn(
              "rounded-pill border border-border px-3 py-1.5 text-xs font-medium transition-colors",
              !adding && r.id === registry?.id
                ? "bg-accent text-accent-foreground"
                : "bg-surface text-text-secondary hover:bg-surface-hover"
            )}
          >
            {r.name}
          </button>
        ))}
        <Button size="sm" onClick={() => setAdding(true)} aria-pressed={adding}>
          <Plus size={13} /> Add registry
        </Button>
      </div>

      {adding ? (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Add a registry</CardTitle>
          </CardHeader>
          <div className="px-5 pb-5">
            <RegistryForm
              registry={null}
              onSaved={(list, id) => {
                queryClient.setQueryData(["registries"], list);
                if (id) setSelectedId(id);
                setAdding(false);
              }}
              onRemoved={() => {}}
            />
          </div>
        </Card>
      ) : registry ? (
        <>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>{registry.kind === "hub" ? "Search Docker Hub" : `Browse ${registry.name}`}</CardTitle>
                <Button size="sm" variant="ghost" onClick={() => setShowSettings((v) => !v)} aria-expanded={showSettings}>
                  {showSettings ? "Hide login" : registry.username ? `Login: ${registry.username}` : "Login"}
                </Button>
              </CardHeader>
              <div className="flex flex-col gap-4 px-5 pb-5">
                {showSettings && (
                  <div className="rounded-control border border-border p-4">
                    <RegistryForm
                      key={registry.id}
                      registry={registry}
                      onSaved={(list) => queryClient.setQueryData(["registries"], list)}
                      onRemoved={(list) => {
                        queryClient.setQueryData(["registries"], list);
                        setSelectedId("hub");
                        setShowSettings(false);
                      }}
                    />
                  </div>
                )}
                <form onSubmit={onSearch} className="flex gap-2">
                  <div className="relative flex-1">
                    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-text-muted" />
                    <input
                      className={cn(inputClass, "pl-9")}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={registry.kind === "hub" ? "nginx, postgres, owner/name..." : "Filter, or type owner/image"}
                      spellCheck={false}
                      aria-label="Search or repository path"
                    />
                  </div>
                  <Button type="submit" disabled={results.isFetching}>
                    {results.isFetching && <Loader2 size={13} className="animate-spin" />}
                    Search
                  </Button>
                  {query.trim() && (
                    <Button type="button" onClick={() => openRepository(query)} title="List the tags of this exact repository">
                      Open
                    </Button>
                  )}
                </form>

                {results.isError ? (
                  <p role="alert" className="text-xs text-text-muted">
                    {errorMessage(results.error)}
                  </p>
                ) : results.isFetching && !results.data ? (
                  <p className="text-xs text-text-muted">Searching...</p>
                ) : (results.data ?? []).length === 0 ? (
                  <EmptyState
                    icon={Cloud}
                    title={registry.kind === "hub" && query.trim().length < 2 ? "Search for an image" : "No repository found"}
                    description={
                      registry.kind === "hub"
                        ? "Type at least two characters."
                        : "Some registries (GitHub, GitLab) do not list repositories: type owner/image and click Open."
                    }
                  />
                ) : (
                  <ul className="max-h-96 divide-y divide-border overflow-y-auto rounded-control border border-border">
                    {results.data!.map((hit) => (
                      <li key={hit.name}>
                        <button
                          onClick={() => openRepository(hit.name)}
                          aria-current={repository === hit.name}
                          className={cn(
                            "flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition-colors hover:bg-surface-hover",
                            repository === hit.name && "bg-surface-hover"
                          )}
                        >
                          <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
                            {hit.name}
                            {hit.official && (
                              <span className="rounded-pill bg-accent/10 px-1.5 text-[10px] font-semibold text-accent">official</span>
                            )}
                            {hit.stars != null && (
                              <span className="ml-auto inline-flex items-center gap-1 text-xs font-normal text-text-muted">
                                <Star size={11} /> {hit.stars}
                              </span>
                            )}
                          </span>
                          {hit.description && <span className="line-clamp-2 text-xs text-text-muted">{hit.description}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{repository ? `${prefix}${repository}` : "Tags"}</CardTitle>
                {repository && (
                  <input
                    className={cn(inputClass, "h-8 w-40 text-xs")}
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                    placeholder="Filter tags"
                    aria-label="Filter tags"
                  />
                )}
              </CardHeader>
              <div className="flex flex-col gap-4 px-5 pb-5">
                {!repository ? (
                  <EmptyState icon={Download} title="Pick a repository" description="Its tags show up here, ready to pull." />
                ) : tags.isPending ? (
                  <p className="text-xs text-text-muted">Loading tags...</p>
                ) : tags.isError ? (
                  <p role="alert" className="text-xs text-danger">
                    {errorMessage(tags.error)}
                  </p>
                ) : visibleTags.length === 0 ? (
                  <p className="text-xs text-text-muted">No tags.</p>
                ) : (
                  <ul className="max-h-96 divide-y divide-border overflow-y-auto rounded-control border border-border">
                    {visibleTags.slice(0, 200).map((tag) => (
                      <li key={tag} className="flex items-center justify-between gap-3 px-4 py-2">
                        <span className="truncate font-mono text-xs text-text-primary">{tag}</span>
                        <Button size="sm" disabled={busy} onClick={() => pull.mutate(tag)}>
                          {pull.isPending && pull.variables === tag ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Download size={13} />
                          )}
                          Pull
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Push a local image to {registry.name}</CardTitle>
            </CardHeader>
            <form
              className="flex flex-wrap items-end gap-3 px-5 pb-5"
              onSubmit={(e) => {
                e.preventDefault();
                push.mutate();
              }}
            >
              <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-medium text-text-secondary">
                Local image
                <select className={inputClass} value={pushSource} onChange={(e) => setPushSource(e.target.value)}>
                  <option value="">Choose an image</option>
                  {localTags.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-48 flex-[2] flex-col gap-1 text-xs font-medium text-text-secondary">
                Repository on the registry
                <div className="flex items-center gap-2">
                  {prefix && <span className="shrink-0 font-mono text-xs text-text-muted">{prefix}</span>}
                  <input
                    className={inputClass}
                    value={pushRepo}
                    onChange={(e) => setPushRepo(e.target.value)}
                    placeholder={registry.kind === "hub" ? "username/image" : "owner/image"}
                    spellCheck={false}
                  />
                </div>
              </label>
              <label className="flex w-32 flex-col gap-1 text-xs font-medium text-text-secondary">
                Tag
                <input className={inputClass} value={pushTag} onChange={(e) => setPushTag(e.target.value)} spellCheck={false} />
              </label>
              <Button type="submit" variant="primary" disabled={busy || !pushSource || !pushRepo.trim()}>
                {push.isPending ? <Loader2 size={13} className="animate-spin" /> : <ArrowUpFromLine size={13} />}
                Push
              </Button>
              {!registry.username && (
                <p className="basis-full text-xs text-text-muted">
                  Pushing needs a login: use the Login button above to add your credentials for {kindLabels[registry.kind]}.
                </p>
              )}
            </form>
          </Card>

          <ProgressPanel progress={progress && progress.length > 0 ? progress : null} />
        </>
      ) : null}
    </div>
  );
}
