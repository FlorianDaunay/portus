import { Link, useParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { BackLink } from "@/components/ui/BackLink";
import { CopyButton } from "@/components/ui/CopyButton";
import { findLesson, lessons } from "@/lib/tutorials";

export function TutorialDetail() {
  const { slug } = useParams();
  const lesson = findLesson(slug);

  if (!lesson) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink to="/learn">Back to tutorials</BackLink>
        <p className="text-sm text-text-muted">Lesson not found.</p>
      </div>
    );
  }

  const index = lessons.indexOf(lesson);
  const next = lessons[index + 1];

  return (
    <div className="flex flex-col gap-6">
      <BackLink to="/learn">Back to tutorials</BackLink>

      <div>
        <p className="text-xs text-text-muted">
          Lesson {index + 1} of {lessons.length} · {lesson.level}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{lesson.title}</h1>
        <p className="mt-1 text-sm text-text-muted">{lesson.summary}</p>
      </div>

      <Card className="p-5">
        <div className="mx-auto max-w-2xl">
          <lesson.Diagram />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {lesson.sections.map((section) => (
          <Card key={section.heading} className="p-5">
            <h2 className="text-sm font-semibold text-text-primary">{section.heading}</h2>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">{section.body}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Commands to try</CardTitle>
          <Link to="/commands" className="text-xs text-accent hover:underline">
            All commands
          </Link>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {lesson.commands.map(({ command, note }) => (
            <div key={command} className="flex items-center justify-between gap-3 rounded-control bg-surface-hover px-3 py-2">
              <div className="min-w-0">
                <code className="block truncate font-mono text-xs text-text-primary">{command}</code>
                <p className="mt-0.5 text-xs text-text-muted">{note}</p>
              </div>
              <CopyButton text={command} />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Link to={lesson.tryIt.to} className="flex items-center gap-1 text-sm font-medium text-accent hover:underline">
          {lesson.tryIt.label} <ArrowRight size={14} />
        </Link>
        {next && (
          <Link to={`/learn/${encodeURIComponent(next.slug)}`} className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary">
            Next: {next.title} <ArrowRight size={14} />
          </Link>
        )}
      </div>
    </div>
  );
}
