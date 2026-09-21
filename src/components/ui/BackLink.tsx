import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export function BackLink({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to} className="flex w-fit items-center gap-1.5 text-sm text-text-muted hover:text-text-primary">
      <ArrowLeft size={14} /> {children}
    </Link>
  );
}
