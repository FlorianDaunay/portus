import { useQuery } from "@tanstack/react-query";
import { Combine, FileCode2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConnectionError } from "@/components/ui/ConnectionError";
import { listComposeProjects } from "@/lib/api";

export function Compose() {
  const { data: projects, isError, error } = useQuery({ queryKey: ["compose"], queryFn: listComposeProjects });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Compose</h1>
        <p className="mt-1 text-sm text-text-muted">{projects?.length ?? 0} projects</p>
      </div>

      {isError && (
        <Card>
          <ConnectionError error={error} />
        </Card>
      )}

      {!isError && projects?.length === 0 && (
        <Card>
          <EmptyState icon={Combine} title="No compose projects found" description="Projects with docker-compose.yml will show up here." />
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(projects ?? []).map((project) => (
          <Card key={project.name}>
            <CardHeader className="flex-col items-start gap-1">
              <div className="flex w-full items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Combine size={15} className="text-accent" />
                  {project.name}
                </CardTitle>
                <span className="text-xs text-text-muted">{project.services.length} services</span>
              </div>
              <p className="flex items-center gap-1.5 text-xs text-text-muted">
                <FileCode2 size={12} />
                {project.configPath}
              </p>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border">
              {project.services.map((service) => (
                <div key={service.name} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{service.name}</p>
                    <p className="truncate text-xs text-text-muted">{service.image}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-text-muted">
                    {service.ports.length > 0 && <span>{service.ports.join(", ")}</span>}
                    <StatusPill status={service.status} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
