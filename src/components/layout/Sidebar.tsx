import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Boxes,
  Layers,
  HardDrive,
  ScrollText,
  Combine,
  GraduationCap,
  TerminalSquare,
  ArrowLeftRight,
  SquareTerminal,
  Network,
  Cloud,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveMigrations } from "@/lib/migrations";
import { version } from "../../../package.json";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const navGroups: Array<{ title?: string; items: NavItem[] }> = [
  {
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/containers", label: "Containers", icon: Boxes },
      { to: "/compose", label: "Compose", icon: Combine },
      { to: "/images", label: "Images", icon: Layers },
      { to: "/volumes", label: "Volumes", icon: HardDrive },
      { to: "/network", label: "Network", icon: Network },
      { to: "/logs", label: "Logs", icon: ScrollText },
    ],
  },
  {
    title: "Tools",
    items: [
      { to: "/registries", label: "Registries", icon: Cloud },
      { to: "/migrate", label: "Migrate", icon: ArrowLeftRight },
      { to: "/console", label: "Console", icon: SquareTerminal },
    ],
  },
  {
    title: "Learn",
    items: [
      { to: "/learn", label: "Tutorials", icon: GraduationCap },
      { to: "/commands", label: "Commands", icon: TerminalSquare },
    ],
  },
  {
    items: [{ to: "/settings", label: "Settings", icon: Settings }],
  },
];

export function Sidebar() {
  const activeMigrations = useActiveMigrations();
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-control bg-accent text-accent-foreground">
          <Boxes size={16} strokeWidth={2.5} />
        </div>
        <span className="text-base font-semibold tracking-tight text-sidebar-text-strong">Portus</span>
      </div>
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3">
        {navGroups.map((group, i) => (
          <div key={group.title ?? i} className="flex flex-col gap-0.5">
            {group.title && (
              <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-sidebar-text/70">{group.title}</p>
            )}
            {group.items.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-control px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-active text-sidebar-text-active"
                      : "text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-strong"
                  )
                }
              >
                <Icon size={16} strokeWidth={2} />
                {label}
                {to === "/migrate" && activeMigrations > 0 && (
                  <span className="ml-auto rounded-pill bg-accent px-1.5 text-xs font-semibold text-accent-foreground">
                    {activeMigrations}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="px-5 py-4 text-xs text-sidebar-text/70">
        Portus <span className="text-sidebar-text">v{version}</span>
      </div>
    </aside>
  );
}
