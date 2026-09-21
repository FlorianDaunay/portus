import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Combine, FileCode2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { BackLink } from "@/components/ui/BackLink";
import { DetailField } from "@/components/ui/DetailField";
import { ConnectionError } from "@/components/ui/ConnectionError";
import { listComposeProjects } from "@/lib/api";
import { containerStatusScore } from "@/lib/utils";

export function ComposeDetail() {
  const { name } = useParams();
  const { data: projects, isPending, isError, error } = useQuery({
    queryKey: ["compose"],
    queryFn: listComposeProjects,
    refetchInterval: 5000,
  });

  const project = projects?.find((p) => p.name === name);

  if (isError) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink to="/compose">Back to compose</BackLink>
        <Card>
          <ConnectionError error={error} />
        </Card>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink to="/compose">Back to compose</BackLink>
        <p className="text-sm text-text-muted">{isPending ? "Loading..." : "Compose project not found."}</p>
      </div>
    );
  }

  // Running services first, the rest keeps Docker's order.
  const services = [...project.services].sort(
    (a, b) => containerStatusScore[b.status] - containerStatusScore[a.status]
  );
  const running = services.filter((s) => s.status === "running").length;
  const ports = [...new Set(services.flatMap((s) => s.ports))];

  return (
    <div className="flex flex-col gap-6">
      <BackLink to="/compose">Back to compose</BackLink>

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Combine size={20} className="shrink-0 text-accent" />
            <span className="truncate">{project.name}</span>
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-text-muted">
            <FileCode2 size={13} className="shrink-0" />
            <span className="truncate" title={project.configPath}>
              {project.configPath || "No config file recorded"}
            </span>
          </p>
        </div>
        <span className="shrink-0 text-sm text-text-muted">
          {running} of {services.length} running
        </span>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-6 pt-5 sm:grid-cols-3">
          <DetailField label="Services">{services.length}</DetailField>
          <DetailField label="Running">{running}</DetailField>
          <DetailField label="Published ports">{ports.join(", ") || "—"}</DetailField>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Services</CardTitle>
        </CardHeader>
        <table className="w-full table-fixed text-left text-sm">
          <thead>
            <tr className="border-y border-border text-xs text-text-muted">
              <th className="w-[28%] px-5 py-3 font-medium">Service</th>
              <th className="w-[32%] px-5 py-3 font-medium">Image</th>
              <th className="w-[22%] px-5 py-3 font-medium">Ports</th>
              <th className="w-[18%] px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {services.map((service) => (
              <tr key={service.containerId || service.name} className="transition-colors hover:bg-surface-hover">
                <td className="truncate px-5 py-3">
                  {service.containerId ? (
                    <Link
                      to={`/containers/${service.containerId}`}
                      className="block truncate font-medium text-text-primary hover:text-accent hover:underline"
                      title={service.name}
                    >
                      {service.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{service.name}</span>
                  )}
                </td>
                <td className="truncate px-5 py-3 text-text-secondary" title={service.image}>
                  {service.image}
                </td>
                <td className="truncate px-5 py-3 text-xs text-text-secondary" title={service.ports.join(", ")}>
                  {service.ports.length ? service.ports.join(", ") : "—"}
                </td>
                <td className="px-5 py-3">
                  <StatusPill status={service.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
