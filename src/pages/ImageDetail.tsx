import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { BackLink } from "@/components/ui/BackLink";
import { DetailField } from "@/components/ui/DetailField";
import { ConnectionError } from "@/components/ui/ConnectionError";
import { ContainerLinks } from "@/components/ContainerLinks";
import { listContainers, listImages } from "@/lib/api";
import { formatBytes, timeAgo } from "@/lib/utils";

export function ImageDetail() {
  const { id } = useParams();
  const images = useQuery({ queryKey: ["images"], queryFn: listImages });
  const containers = useQuery({ queryKey: ["containers"], queryFn: listContainers, refetchInterval: 5000 });

  const image = images.data?.find((i) => i.id === id);

  if (images.isError) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink to="/images">Back to images</BackLink>
        <Card>
          <ConnectionError error={images.error} />
        </Card>
      </div>
    );
  }

  if (!image) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink to="/images">Back to images</BackLink>
        <p className="text-sm text-text-muted">{images.isPending ? "Loading..." : "Image not found."}</p>
      </div>
    );
  }

  const users = (containers.data ?? []).filter((c) => c.imageId === image.id);
  const tags = image.repoTags.length ? image.repoTags : [image.repoTag];

  return (
    <div className="flex flex-col gap-6">
      <BackLink to="/images">Back to images</BackLink>

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Layers size={20} className="shrink-0 text-accent" />
            <span className="truncate" title={image.repoTag}>
              {image.repoTag}
            </span>
          </h1>
          <p className="mt-1 truncate text-sm text-text-muted" title={image.id}>
            {image.id}
          </p>
        </div>
        {image.inUse ? (
          <span className="shrink-0 text-xs font-medium text-success">In use</span>
        ) : (
          <span className="shrink-0 text-xs text-text-muted">Unused</span>
        )}
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-6 pt-5 sm:grid-cols-2">
          <DetailField label="Size">{formatBytes(image.sizeMb)}</DetailField>
          <DetailField label="Created">
            {new Date(image.createdAt).toLocaleString()} ({timeAgo(image.createdAt)})
          </DetailField>
          <DetailField label="Tags" className="sm:col-span-2">
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span key={tag} className="rounded-pill border border-border bg-surface-hover px-2.5 py-1 text-xs">
                  {tag}
                </span>
              ))}
            </div>
          </DetailField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Containers using this image</CardTitle>
          <span className="text-xs text-text-muted">{users.length}</span>
        </CardHeader>
        <CardContent>
          <ContainerLinks containers={users} empty="No container uses this image." />
        </CardContent>
      </Card>
    </div>
  );
}
