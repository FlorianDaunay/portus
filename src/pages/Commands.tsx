import { useMemo, useState, type FormEvent } from "react";
import { Plus, TerminalSquare, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchInput } from "@/components/ui/SearchInput";
import { builtinCommands, CUSTOM_CATEGORY, useCustomCommands } from "@/lib/commands";
import { cn } from "@/lib/utils";

const inputClass =
  "h-9 w-full rounded-control border border-border bg-surface px-3 text-sm text-text-primary shadow-inset placeholder:text-text-muted";

function AddCommand() {
  const add = useCustomCommands((s) => s.add);
  const [command, setCommand] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;
    add({ command, description, category });
    setCommand("");
    setDescription("");
    setCategory("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add your own command</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <input
            className={cn(inputClass, "font-mono text-xs md:col-span-2")}
            placeholder="docker run --rm -it alpine sh"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            spellCheck={false}
            aria-label="Command"
          />
          <input
            className={inputClass}
            placeholder="What it does (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-label="Description"
          />
          <input
            className={inputClass}
            placeholder={`Category (default: ${CUSTOM_CATEGORY})`}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Category"
          />
          <div className="flex items-center justify-between gap-3 md:col-span-2">
            <p className="text-xs text-text-muted">Saved on this computer. Portus copies commands; it doesn't run them.</p>
            <Button type="submit" variant="primary" size="md" disabled={!command.trim()}>
              <Plus size={15} />
              Add command
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function Commands() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const custom = useCustomCommands((s) => s.custom);
  const remove = useCustomCommands((s) => s.remove);

  const all = useMemo(() => [...custom, ...builtinCommands], [custom]);
  const categories = useMemo(() => Array.from(new Set(all.map((c) => c.category))), [all]);
  const activeCategory = category && categories.includes(category) ? category : null;

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = all.filter(
      (c) =>
        (!activeCategory || c.category === activeCategory) &&
        (!q || `${c.command} ${c.description} ${c.category}`.toLowerCase().includes(q))
    );
    return categories
      .map((name) => ({ name, items: matching.filter((c) => c.category === name) }))
      .filter((g) => g.items.length > 0);
  }, [all, categories, activeCategory, query]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Commands</h1>
          <p className="mt-1 text-sm text-text-muted">
            {all.length} useful Docker commands{custom.length > 0 && `, ${custom.length} of them yours`}. Replace the{" "}
            <code className="font-mono">&lt;placeholders&gt;</code> before running.
          </p>
        </div>
        <SearchInput
          placeholder="Filter commands..."
          className="w-64"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {[null, ...categories].map((name) => (
          <button
            key={name ?? "all"}
            type="button"
            aria-pressed={activeCategory === name}
            onClick={() => setCategory(name)}
            className={cn(
              "rounded-pill border border-border px-3 py-1 text-xs font-medium transition-colors",
              activeCategory === name
                ? "bg-accent text-accent-foreground"
                : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            )}
          >
            {name ?? "All"}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <Card>
          <EmptyState icon={TerminalSquare} title="No command found" description="Try adjusting your search." />
        </Card>
      ) : (
        groups.map((group) => (
          <Card key={group.name} className="overflow-hidden">
            <CardHeader className="border-b border-border">
              <CardTitle>{group.name}</CardTitle>
              <span className="text-xs text-text-muted">{group.items.length}</span>
            </CardHeader>
            <ul className="divide-y divide-border">
              {group.items.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface-hover">
                  <div className="min-w-0">
                    <code className="block truncate font-mono text-xs text-text-primary" title={c.command}>
                      {c.command}
                    </code>
                    {c.description && <p className="mt-0.5 text-xs text-text-muted">{c.description}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <CopyButton text={c.command} />
                    {c.custom && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Delete"
                        aria-label="Delete command"
                        className="hover:bg-danger/10 hover:text-danger"
                        onClick={() => remove(c.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}

      <AddCommand />
    </div>
  );
}
