import { Moon, Sun, Wifi, WifiOff } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { SearchInput } from "@/components/ui/SearchInput";
import { Button } from "@/components/ui/Button";
import { useThemeStore } from "@/lib/theme";
import { getDaemonInfo } from "@/lib/api";
import { cn } from "@/lib/utils";

export function TopBar() {
  const { theme, toggle } = useThemeStore();
  const { data } = useQuery({ queryKey: ["daemon-info"], queryFn: getDaemonInfo, refetchInterval: 5000 });
  const connected = data?.connected ?? false;

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-surface px-6">
      <SearchInput placeholder="Search containers, images, volumes..." className="max-w-sm" />
      <div className="flex-1" />
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium",
          connected ? "text-success" : "text-danger"
        )}
      >
        {connected ? <Wifi size={13} /> : <WifiOff size={13} />}
        {connected ? `Docker ${data?.version ?? ""}` : "Disconnected"}
      </div>
      <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </Button>
    </header>
  );
}
