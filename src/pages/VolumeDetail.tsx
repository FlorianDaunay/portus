import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { HardDrive } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { BackLink } from "@/components/ui/BackLink";
import { DetailField } from "@/components/ui/DetailField";
import { ConnectionError } from "@/components/ui/ConnectionError";
import { ContainerLinks } from "@/components/ContainerLinks";
import { listContainers, listVolumes } from "@/lib/api";

export function VolumeDetail() {
  const { name } = useParams();
  const volumes = useQuery({ queryKey: ["volumes"], queryFn: listVolumes });
  const containers = useQuery({ queryKey: ["containers"], queryFn: listContainers, refetchInterval: 5000 });

  const volume = volumes.data?.find((v) => v.name === name);

  if (volumes.isError) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink to="/volumes">Back to volumes</BackLink>
        <Card>
          <ConnectionError error={volumes.error} />
        </Card>
      </div>
    );
  }

  if (!volume) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink to="/volumes">Back to volumes</BackLink>
        <p className="text-sm text-text-muted">{volumes.isPending ? "Loading..." : "Volume not found."}</p>
      </div>
    );
  }

  const users = (containers.data ?? []).filter((c) => c.volumes.includes(volume.name));

  return (
    <div className="flex flex-col gap-6">
      <BackLink to="/volumes">Back to volumes</BackLink>

      <div className="flex items-center justify-between gap-4">
        <h1 className="flex min-w-0 items-center gap-2 text-2xl font-semibold tracking-tight">
          <HardDrive size={20} className="shrink-0 text-accent" />
          <span className="truncate" title={volume.name}>
            {volume.name}
          </span>
        </h1>
        {volume.inUse ? (
          <span className="shrink-0 text-xs font-medium text-success">In use</span>
        ) : (
          <span className="shrink-0 text-xs text-text-muted">Unused</span>
        )}
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-6 pt-5 sm:grid-cols-2">
          <DetailField label="Driver">{volume.driver}</DetailField>
          <DetailField label="Mountpoint">
            <span className="font-mono text-xs">{volume.mountpoint}</span>
          </DetailField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Containers mounting this volume</CardTitle>
          <span className="text-xs text-text-muted">{users.length}</span>
        </CardHeader>
        <CardContent>
          <ContainerLinks containers={users} empty="No container mounts this volume." />
        </CardContent>
      </Card>
    </div>
  );
}
