import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Boxes,
  Layers,
  HardDrive,
  ScrollText,
  Combine,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/containers", label: "Containers", icon: Boxes },
  { to: "/compose", label: "Compose", icon: Combine },
  { to: "/images", label: "Images", icon: Layers },
  { to: "/volumes", label: "Volumes", icon: HardDrive },
  { to: "/logs", label: "Logs", icon: ScrollText },
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-control bg-accent text-accent-foreground">
          <Boxes size={16} strokeWidth={2.5} />
        </div>
        <span className="text-base font-semibold tracking-tight">Portus</span>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 rounded-control px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent/10 text-accent"
                  : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              )
            }
          >
            <Icon size={16} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="px-5 py-4 text-xs text-text-muted">
        Portus <span className="text-text-secondary">v0.1.0</span>
      </div>
    </aside>
  );
}
