import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { onConsoleEvents } from "@/lib/api";

/* ---------------------------------------------------------------- session (output of the runs) */

export interface ConsoleLine {
  stream: "out" | "err" | "info";
  text: string;
}

export interface ConsoleEntry {
  id: number;
  command: string;
  lines: ConsoleLine[];
  /** `null` while the command runs. */
  exitCode: number | null | undefined;
  running: boolean;
}

const MAX_ENTRIES = 30;
const MAX_LINES = 3000;

interface SessionState {
  entries: ConsoleEntry[];
  begin: (id: number, command: string) => void;
  append: (id: number, line: ConsoleLine) => void;
  finish: (id: number, code: number | null) => void;
  clear: () => void;
}

/** Output of this session's runs; kept out of the page so leaving it doesn't lose a running command. */
export const useConsoleSession = create<SessionState>((set) => {
  const patch = (id: number, change: (entry: ConsoleEntry) => ConsoleEntry) =>
    set((s) => ({ entries: s.entries.map((e) => (e.id === id ? change(e) : e)) }));
  return {
    entries: [],
    begin: (id, command) =>
      set((s) => ({
        entries: [...s.entries, { id, command, lines: [], exitCode: undefined, running: true }].slice(-MAX_ENTRIES),
      })),
    append: (id, line) => patch(id, (e) => ({ ...e, lines: [...e.lines, line].slice(-MAX_LINES) })),
    finish: (id, code) => patch(id, (e) => ({ ...e, running: false, exitCode: code })),
    clear: () => set((s) => ({ entries: s.entries.filter((e) => e.running) })),
  };
});

/** Feeds the session from the backend events. Mount it once, in the app shell. */
export function useConsoleEvents() {
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    const { append, finish } = useConsoleSession.getState();
    onConsoleEvents(
      (e) => append(e.runId, { stream: e.stream, text: e.line }),
      (e) => finish(e.runId, e.code)
    ).then((fn) => {
      if (cancelled) fn();
      else stop = fn;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);
}

/* ---------------------------------------------------------------- history */

interface HistoryState {
  history: string[];
  push: (line: string) => void;
  clear: () => void;
}

export const useConsoleHistory = create<HistoryState>()(
  persist(
    (set) => ({
      history: [],
      push: (line) =>
        set((s) => ({ history: [...s.history.filter((h) => h !== line), line].slice(-100) })),
      clear: () => set({ history: [] }),
    }),
    { name: "portus-console" }
  )
);

/* ---------------------------------------------------------------- completion */

export interface CompletionData {
  containers: Array<{ name: string; hint: string }>;
  images: Array<{ name: string; hint: string }>;
  volumes: Array<{ name: string; hint: string }>;
  services: Array<{ name: string; hint: string }>;
}

export interface Suggestion {
  text: string;
  hint: string;
}

const SUBCOMMANDS = [
  "ps", "run", "exec", "logs", "stop", "start", "restart", "rm", "images", "pull", "build", "push", "tag", "rmi",
  "inspect", "stats", "top", "cp", "volume", "network", "compose", "system", "image", "container", "info", "version",
  "history", "save", "load", "kill", "pause", "unpause", "port", "rename", "diff", "commit", "context",
];

const CONTAINER_COMMANDS = new Set([
  "start", "stop", "restart", "rm", "kill", "pause", "unpause", "logs", "exec", "attach", "inspect", "stats", "top",
  "port", "rename", "diff", "commit", "wait", "cp", "update", "export",
]);
const IMAGE_COMMANDS = new Set(["run", "create", "rmi", "history", "save", "tag", "push", "inspect"]);
const IMAGE_SUBCOMMANDS = new Set(["rm", "inspect", "history", "save", "tag", "push", "ls"]);
const CONTAINER_SUBCOMMANDS = new Set([
  "start", "stop", "restart", "rm", "kill", "pause", "unpause", "logs", "exec", "attach", "inspect", "stats", "top",
  "port", "rename", "diff", "commit", "cp", "run",
]);
const COMPOSE_SERVICE_COMMANDS = new Set([
  "logs", "restart", "stop", "start", "exec", "ps", "up", "run", "build", "pull", "top", "kill", "pause", "unpause", "port",
]);

const startsWith = (candidate: string, word: string) => candidate.toLowerCase().startsWith(word.toLowerCase());
const contains = (candidate: string, word: string) => candidate.toLowerCase().includes(word.toLowerCase());

function pick(list: Array<{ name: string; hint: string }>, word: string): Suggestion[] {
  const prefix = list.filter((i) => startsWith(i.name, word));
  const rest = list.filter((i) => !startsWith(i.name, word) && contains(i.name, word));
  return [...prefix, ...rest].slice(0, 8).map((i) => ({ text: i.name, hint: i.hint }));
}

/** The whitespace-delimited word ending at `caret`, and where it starts. */
export function wordAt(text: string, caret: number): { word: string; start: number; before: string[] } {
  const head = text.slice(0, caret);
  const start = head.search(/\S*$/);
  return { word: head.slice(start), start, before: head.slice(0, start).split(/\s+/).filter(Boolean) };
}

/** Docker-aware suggestions for the word under the caret: names of containers, images, volumes... */
export function suggest(text: string, caret: number, data: CompletionData): Suggestion[] {
  const { word, before } = wordAt(text, caret);
  if (before[0] !== "docker") {
    return before.length === 0 && word && "docker".startsWith(word) && word !== "docker"
      ? [{ text: "docker", hint: "" }]
      : [];
  }

  // A placeholder from the command library: <container>, <image>, <volume>...
  const placeholder = /^<([a-z-]+)>?$/i.exec(word)?.[1]?.toLowerCase();
  if (placeholder) {
    if (placeholder.startsWith("container")) return pick(data.containers, "");
    if (placeholder.startsWith("image")) return pick(data.images, "");
    if (placeholder.startsWith("volume")) return pick(data.volumes, "");
    if (placeholder.startsWith("service")) return pick(data.services, "");
    return [];
  }
  if (word.startsWith("-")) return [];

  const positional = before.slice(1).filter((t) => !t.startsWith("-"));
  const previous = before[before.length - 1];
  if (positional.length === 0) {
    return SUBCOMMANDS.filter((s) => startsWith(s, word) && s !== word).slice(0, 8).map((s) => ({ text: s, hint: "" }));
  }

  const sub = positional[0];
  const sub2 = positional[1];
  if (previous === "-v" || previous === "--volume") return pick(data.volumes, word.split(":")[0]);
  if (sub === "volume") return sub2 && ["rm", "inspect"].includes(sub2) ? pick(data.volumes, word) : positional.length === 1
    ? ["ls", "create", "rm", "inspect", "prune"].filter((s) => startsWith(s, word)).map((s) => ({ text: s, hint: "" }))
    : [];
  if (sub === "compose") {
    if (positional.length === 1) {
      return ["up", "down", "ps", "logs", "restart", "stop", "start", "build", "pull", "exec"]
        .filter((s) => startsWith(s, word))
        .map((s) => ({ text: s, hint: "" }));
    }
    return COMPOSE_SERVICE_COMMANDS.has(sub2) ? pick(data.services, word) : [];
  }
  if (sub === "container" && sub2 && CONTAINER_SUBCOMMANDS.has(sub2)) return pick(data.containers, word);
  if (sub === "image" && sub2 && IMAGE_SUBCOMMANDS.has(sub2)) return pick(data.images, word);

  if (sub === "inspect") return pick([...data.containers, ...data.images], word);
  if (IMAGE_COMMANDS.has(sub) && positional.length === 1) return pick(data.images, word);
  if (CONTAINER_COMMANDS.has(sub)) return pick(data.containers, word);
  return [];
}

/** Whether the line asks for an interactive terminal, which the console can't provide. */
export function needsTerminal(line: string): boolean {
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] !== "docker") return false;
  const sub = tokens.slice(1).find((t) => !t.startsWith("-"));
  if (!sub || !["run", "exec", "attach"].includes(sub)) return false;
  return tokens.some((t) => /^-[a-zA-Z]*[it][a-zA-Z]*$/.test(t)) || tokens.includes("--tty") || tokens.includes("--interactive");
}
