import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { lessons } from "@/lib/tutorials";

export function Tutorials() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tutorials</h1>
        <p className="mt-1 text-sm text-text-muted">
          Short lessons with animated schemas. They work without a running Docker engine.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {lessons.map(({ slug, title, summary, level, Diagram }, i) => (
          <Link key={slug} to={`/learn/${encodeURIComponent(slug)}`} className="group block">
            <Card className="flex h-full flex-col gap-3 p-5 transition-colors group-hover:bg-surface-hover">
              <div className="overflow-hidden rounded-control bg-surface-hover p-2 group-hover:bg-surface">
                <Diagram />
              </div>
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>Lesson {i + 1}</span>
                <span className="rounded-pill border border-border px-2 py-0.5">{level}</span>
              </div>
              <h2 className="text-base font-semibold text-text-primary">{title}</h2>
              <p className="text-sm text-text-muted">{summary}</p>
              <span className="mt-auto flex items-center gap-1 text-xs font-medium text-accent">
                Start lesson <ArrowRight size={12} />
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
