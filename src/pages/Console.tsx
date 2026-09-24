import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Play, Square, Trash2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/SearchInput";
import { cancelConsoleCommand, listComposeProjects, listContainers, listImages, listVolumes, runConsoleCommand } from "@/lib/api";
import { builtinCommands, useCustomCommands } from "@/lib/commands";
import {
  needsTerminal,
  suggest,
  useConsoleHistory,
  useConsoleSession,
  wordAt,
  type CompletionData,
} from "@/lib/console";
import { cn, errorMessage } from "@/lib/utils";

type LibraryTab = "commands" | "history";

/** Moves the selection onto the next `<placeholder>` after the caret (wrapping), if the line has one. */
function selectPlaceholder(input: HTMLInputElement, from: number): boolean {
  const pattern = /<[^>\s]+>/g;
  const text = input.value;
  let first: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    first ??= match;
    if (match.index >= from) {
      input.setSelectionRange(match.index, match.index + match[0].length);
      return true;
    }
  }
  if (first) {
    input.setSelectionRange(first.index, first.index + first[0].length);
    return true;
  }
  return false;
}

export function Console() {
  const [text, setText] = useState("docker ");
  const [caret, setCaret] = useState(7);
  const [active, setActive] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [tab, setTab] = useState<LibraryTab>("commands");
  const [filter, setFilter] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const { entries, begin, append, finish, clear } = useConsoleSession();
  const { history, push: pushHistory, clear: clearHistory } = useConsoleHistory();
  const custom = useCustomCommands((s) => s.custom);
  const running = entries.find((e) => e.running);

  const { data: containers } = useQuery({ queryKey: ["containers"], queryFn: listContainers, refetchInterval: 5000 });
  const { data: images } = useQuery({ queryKey: ["images"], queryFn: listImages });
  const { data: volumes } = useQuery({ queryKey: ["volumes"], queryFn: listVolumes });
  const { data: projects } = useQuery({ queryKey: ["compose"], queryFn: listComposeProjects });

  const data: CompletionData = useMemo(
    () => ({
      containers: (containers ?? []).map((c) => ({ name: c.name, hint: c.status })),
      images: (images ?? []).flatMap((i) =>
        i.repoTags.filter((t) => !t.startsWith("<none>")).map((t) => ({ name: t, hint: `${i.sizeMb.toFixed(0)} MB` }))
      ),
      volumes: (volumes ?? []).map((v) => ({ name: v.name, hint: v.inUse ? "in use" : "" })),
      services: (projects ?? []).flatMap((p) => p.services.map((s) => ({ name: s.name, hint: p.name }))),
    }),
    [containers, images, volumes, projects]
  );

  const suggestions = useMemo(() => (dismissed ? [] : suggest(text, caret, data)), [dismissed, text, caret, data]);

  useEffect(() => {
    const el = outputRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);

  const library = useMemo(() => {
    const all = [...custom, ...builtinCommands];
    const q = filter.trim().toLowerCase();
    const shown = q ? all.filter((c) => `${c.command} ${c.description}`.toLowerCase().includes(q)) : all;
    const groups = new Map<string, typeof all>();
    for (const c of shown) groups.set(c.category, [...(groups.get(c.category) ?? []), c]);
    return [...groups.entries()];
  }, [custom, filter]);

  const edit = (value: string, position = value.length) => {
    setText(value);
    setCaret(position);
    setActive(-1);
    setDismissed(false);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(position, position);
    });
  };

  /** Puts a library command in the input, ready to fill in its first placeholder. */
  const insert = (command: string) => {
    setText(command);
    setActive(-1);
    setDismissed(true);
    setHistoryIndex(null);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      if (!selectPlaceholder(input, 0)) input.setSelectionRange(command.length, command.length);
      setCaret(input.selectionEnd ?? command.length);
      setDismissed(false);
    });
  };

  const accept = (index: number) => {
    const chosen = suggestions[index];
    if (!chosen) return;
    const { start } = wordAt(text, caret);
    const after = text.slice(caret);
    const value = `${text.slice(0, start)}${chosen.text}${after.startsWith(" ") ? "" : " "}${after}`;
    edit(value, start + chosen.text.length + 1);
  };

  const run = async (raw: string) => {
    const line = raw.trim();
    if (!line || running) return;
    pushHistory(line);
    setHistoryIndex(null);
    const id = Date.now();
    begin(id, line);
    setText("docker ");
    setCaret(7);
    setActive(-1);
    if (needsTerminal(line)) {
      append(id, {
        stream: "info",
        text: "Interactive terminals (-i, -t) aren't available here. Remove -it, or run detached with -d.",
      });
      finish(id, null);
      return;
    }
    try {
      await runConsoleCommand(id, line);
    } catch (e) {
      append(id, { stream: "err", text: errorMessage(e) });
      finish(id, null);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const open = suggestions.length > 0;
    if (e.key === "Enter") {
      e.preventDefault();
      if (open && active >= 0) accept(active);
      else void run(text);
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (open) accept(Math.max(active, 0));
      else if (inputRef.current) selectPlaceholder(inputRef.current, inputRef.current.selectionEnd ?? 0);
    } else if (e.key === "Escape") {
      setDismissed(true);
      setActive(-1);
    } else if (e.key === "ArrowDown" && open) {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp" && open) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && history.length > 0) {
      e.preventDefault();
      const last = history.length - 1;
      const next =
        e.key === "ArrowUp"
          ? historyIndex === null ? last : Math.max(0, historyIndex - 1)
          : historyIndex === null ? null : historyIndex >= last ? null : historyIndex + 1;
      setHistoryIndex(next);
      const value = next === null ? "docker " : history[next];
      edit(value);
    }
  };

  const showHistory = [...history].reverse().filter((h) => h.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Console</h1>
        <p className="mt-1 text-sm text-text-muted">
          Run docker commands against the engine you are connected to. Names of containers, images and volumes complete
          as you type (Tab to accept).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="flex h-[60vh] min-h-96 flex-col overflow-hidden">
          <div ref={outputRef} className="flex-1 overflow-y-auto bg-surface-hover px-4 py-3 font-mono text-xs">
            {entries.length === 0 ? (
              <p className="text-text-muted">
                Nothing run yet. Try <span className="text-text-primary">docker ps</span>, or pick a command on the right.
              </p>
            ) : (
              entries.map((entry) => (
                <div key={entry.id} className="mb-3">
                  <p className="text-accent">
                    <span className="select-none text-text-muted">$ </span>
                    {entry.command}
                  </p>
                  {entry.lines.map((line, i) => (
                    <pre
                      key={i}
                      className={cn(
                        "whitespace-pre-wrap break-all",
                        line.stream === "err" && "text-danger",
                        line.stream === "out" && "text-text-primary",
                        line.stream === "info" && "text-warning"
                      )}
                    >
                      {line.text}
                    </pre>
                  ))}
                  {entry.running ? (
                    <p className="text-text-muted">Running...</p>
                  ) : entry.exitCode ? (
                    <p className="text-danger">Exited with code {entry.exitCode}</p>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <div className="relative border-t border-border bg-surface p-3">
            {suggestions.length > 0 && (
              <ul
                role="listbox"
                className="absolute bottom-full left-3 z-20 mb-1 w-96 max-w-[calc(100%-1.5rem)] overflow-hidden rounded-control border border-border bg-surface-solid py-1 shadow-overlay"
              >
                {suggestions.map((s, i) => (
                  <li key={s.text} role="option" aria-selected={i === active}>
                    <button
                      type="button"
                      tabIndex={-1}
                      // Keep the focus in the input so the caret survives the click.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => accept(i)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left font-mono text-xs",
                        i === active ? "bg-accent/10 text-text-primary" : "text-text-secondary hover:bg-surface-hover"
                      )}
                    >
                      <span className="truncate">{s.text}</span>
                      {s.hint && <span className="shrink-0 text-text-muted">{s.hint}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setCaret(e.target.selectionStart ?? e.target.value.length);
                  setActive(-1);
                  setDismissed(false);
                }}
                onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
                onKeyDown={onKeyDown}
                spellCheck={false}
                autoComplete="off"
                aria-label="Docker command"
                placeholder="docker ps"
                className="h-9 min-w-0 flex-1 rounded-control border border-border bg-surface px-3 font-mono text-xs text-text-primary shadow-inset placeholder:text-text-muted"
              />
              {running ? (
                <Button variant="danger" size="md" onClick={() => void cancelConsoleCommand(running.id)}>
                  <Square size={14} />
                  Stop
                </Button>
              ) : (
                <Button variant="primary" size="md" onClick={() => void run(text)} disabled={!text.trim()}>
                  <Play size={14} />
                  Run
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={clear} aria-label="Clear output" title="Clear output">
                <Trash2 size={15} />
              </Button>
            </div>
          </div>
        </Card>

        <Card className="flex h-[60vh] min-h-96 flex-col overflow-hidden">
          <CardHeader className="pb-2">
            <div className="inline-flex rounded-control border border-border p-0.5" role="tablist">
              {(["commands", "history"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "rounded-control px-3 py-1 text-xs font-medium capitalize transition-colors",
                    tab === t ? "bg-accent text-accent-foreground" : "text-text-secondary hover:bg-surface-hover"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            {tab === "history" && history.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearHistory}>
                Clear
              </Button>
            )}
          </CardHeader>
          <div className="px-4 pb-3">
            <SearchInput placeholder={tab === "commands" ? "Filter commands..." : "Filter history..."} value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-3">
            {tab === "history" ? (
              showHistory.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-text-muted">No command run yet.</p>
              ) : (
                showHistory.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => insert(h)}
                    className="block w-full truncate rounded-control px-3 py-1.5 text-left font-mono text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                    title={h}
                  >
                    {h}
                  </button>
                ))
              )
            ) : (
              <>
                {library.map(([category, commands]) => (
                  <div key={category} className="mb-2">
                    <p className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-text-muted">{category}</p>
                    {commands.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => insert(c.command)}
                        className="block w-full rounded-control px-3 py-1.5 text-left hover:bg-surface-hover"
                        title={c.description}
                      >
                        <span className="block truncate font-mono text-xs text-text-primary">{c.command}</span>
                        {c.description && <span className="block truncate text-xs text-text-muted">{c.description}</span>}
                      </button>
                    ))}
                  </div>
                ))}
                <p className="px-3 pt-2 text-xs text-text-muted">
                  Your own commands live on the{" "}
                  <Link to="/commands" className="text-accent hover:underline">
                    Commands
                  </Link>{" "}
                  page and show up here too.
                </p>
              </>
            )}
          </div>
        </Card>
      </div>

      <p className="text-xs text-text-muted">
        Each line runs as one docker command: pipes, redirections and variables aren't interpreted, and interactive
        terminals (-it) aren't supported.
      </p>
    </div>
  );
}
