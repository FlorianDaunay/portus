import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Moon, Palette, Sun } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/SearchInput";
import { Switch } from "@/components/ui/Switch";
import { ThemePreview } from "./ThemePreview";
import { cn } from "@/lib/utils";
import { themes, useActiveTheme, useThemeStore, type Theme, type ThemeScheme } from "@/themes";

function ThemeCard({ theme, selected, onSelect }: { theme: Theme; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex flex-col gap-2 rounded-tile p-1.5 text-left transition-colors hover:bg-surface-hover",
        selected && "bg-surface-hover ring-2 ring-accent"
      )}
    >
      <ThemePreview theme={theme} />
      <div className="flex items-start justify-between gap-2 px-1 pb-1">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text-primary">{theme.name}</p>
          <p className="truncate text-xs text-text-muted" title={theme.description}>
            {theme.description}
          </p>
        </div>
        {selected && <Check size={14} className="mt-0.5 shrink-0 text-accent" />}
      </div>
    </button>
  );
}

function ThemeGroup({
  scheme,
  items,
  selectedIds,
  onSelect,
}: {
  scheme: ThemeScheme;
  items: Theme[];
  selectedIds: string[];
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) return null;
  const Icon = scheme === "light" ? Sun : Moon;

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 px-1.5 text-xs font-medium uppercase tracking-wide text-text-muted">
        <Icon size={12} />
        {scheme === "light" ? "Light" : "Dark"} themes
        <span className="font-normal normal-case">({items.length})</span>
      </h3>
      <div role="radiogroup" aria-label={`${scheme} themes`} className="grid grid-cols-3 gap-1">
        {items.map((theme) => (
          <ThemeCard key={theme.id} theme={theme} selected={selectedIds.includes(theme.id)} onSelect={() => onSelect(theme.id)} />
        ))}
      </div>
    </section>
  );
}

export function ThemePicker() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const active = useActiveTheme();
  const followSystem = useThemeStore((s) => s.followSystem);
  const lightId = useThemeStore((s) => s.lightId);
  const darkId = useThemeStore((s) => s.darkId);
  const setFollowSystem = useThemeStore((s) => s.setFollowSystem);
  const selectTheme = useThemeStore((s) => s.selectTheme);
  const selectedIds = followSystem ? [lightId, darkId] : [active.id];

  const matching = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return themes;
    return themes.filter((t) => `${t.name} ${t.description} ${t.id}`.toLowerCase().includes(q));
  }, [query]);

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

  return (
    <div ref={rootRef} className="relative">
      <Button variant="ghost" size="sm" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Palette size={15} />
        <span className="hidden sm:inline">{active.name}</span>
      </Button>

      {open && (
        <div
          role="dialog"
          aria-labelledby={titleId}
          className="absolute right-0 top-full z-40 mt-2 w-[36rem] max-w-[calc(100vw-2rem)] animate-fade-in rounded-card border bg-surface-solid shadow-overlay"
        >
          <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
            <div>
              <h2 id={titleId} className="text-sm font-semibold text-text-primary">
                Appearance
              </h2>
              <p className="mt-0.5 text-xs text-text-muted">
                {followSystem
                  ? "Following your system's light or dark mode. Picking a theme turns this off."
                  : "Pick a theme for the whole app."}
              </p>
            </div>
            <label className="flex shrink-0 items-center gap-2 text-xs text-text-secondary">
              Match system
              <Switch checked={followSystem} onCheckedChange={setFollowSystem} aria-label="Match system appearance" />
            </label>
          </div>
          <div className="border-b px-3.5 py-3">
            <SearchInput
              placeholder={`Search ${themes.length} themes...`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              aria-label="Search themes"
            />
          </div>
          <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto p-3.5">
            {matching.length === 0 && <p className="py-8 text-center text-sm text-text-muted">No theme matches "{query}".</p>}
            <ThemeGroup scheme="light" items={matching.filter((t) => t.scheme === "light")} selectedIds={selectedIds} onSelect={selectTheme} />
            <ThemeGroup scheme="dark" items={matching.filter((t) => t.scheme === "dark")} selectedIds={selectedIds} onSelect={selectTheme} />
          </div>
        </div>
      )}
    </div>
  );
}
