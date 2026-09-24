import type { EngineContents, MigrationKind } from "@/lib/types";

export interface PlanItem {
  key: string;
  kind: MigrationKind;
  id: string;
  label: string;
  /** Picked by the user, or pulled in because a picked container needs it. */
  reason: "picked" | "needed";
  /** Names of the picked containers that need this item. */
  neededBy: string[];
  /** Something with the same identity is already on the destination. */
  onDestination: boolean;
}

export const containerKey = (id: string) => `container:${id}`;
export const imageKey = (id: string) => `image:${id}`;
export const volumeKey = (name: string) => `volume:${name}`;

/** Human name of an image: its first tag, or a short id when it has none. */
export function imageLabel(source: EngineContents, id: string): string {
  const image = source.images.find((i) => i.id === id);
  return image?.repoTag && !image.repoTag.startsWith("<none>") ? image.repoTag : id.replace("sha256:", "").slice(0, 12);
}

/**
 * Turns the user's picks into what has to move: a container drags its image and its volumes along.
 * Duplicates (same container name, image id or volume name on the destination) are flagged so
 * they can be skipped rather than imported twice.
 */
export function resolvePlan(
  picked: ReadonlySet<string>,
  source: EngineContents,
  destination: EngineContents | undefined
): Map<string, PlanItem> {
  const destContainers = new Set(destination?.containers.map((c) => c.name));
  const destImages = new Set(destination?.images.map((i) => i.id));
  const destVolumes = new Set(destination?.volumes.map((v) => v.name));
  const plan = new Map<string, PlanItem>();

  const add = (item: Omit<PlanItem, "neededBy" | "onDestination">, onDestination: boolean, neededBy?: string) => {
    const existing = plan.get(item.key);
    if (existing) {
      if (neededBy && !existing.neededBy.includes(neededBy)) existing.neededBy.push(neededBy);
      if (item.reason === "picked") existing.reason = "picked";
      return;
    }
    plan.set(item.key, { ...item, onDestination, neededBy: neededBy ? [neededBy] : [] });
  };

  for (const image of source.images) {
    if (!picked.has(imageKey(image.id))) continue;
    add(
      { key: imageKey(image.id), kind: "image", id: image.id, label: imageLabel(source, image.id), reason: "picked" },
      destImages.has(image.id)
    );
  }
  for (const volume of source.volumes) {
    if (!picked.has(volumeKey(volume.name))) continue;
    add(
      { key: volumeKey(volume.name), kind: "volume", id: volume.name, label: volume.name, reason: "picked" },
      destVolumes.has(volume.name)
    );
  }
  for (const container of source.containers) {
    if (!picked.has(containerKey(container.id))) continue;
    add(
      { key: containerKey(container.id), kind: "container", id: container.id, label: container.name, reason: "picked" },
      destContainers.has(container.name)
    );
    if (container.imageId) {
      add(
        {
          key: imageKey(container.imageId),
          kind: "image",
          id: container.imageId,
          label: imageLabel(source, container.imageId),
          reason: "needed",
        },
        destImages.has(container.imageId),
        container.name
      );
    }
    for (const volume of container.volumes) {
      add(
        { key: volumeKey(volume), kind: "volume", id: volume, label: volume, reason: "needed" },
        destVolumes.has(volume),
        container.name
      );
    }
  }
  return plan;
}

/** Keys linked to one tile, to light up its dependencies (or its dependents) on hover. */
export function relatedKeys(key: string, source: EngineContents): Set<string> {
  const related = new Set<string>();
  const [kind, ...rest] = key.split(":");
  const id = rest.join(":");
  for (const c of source.containers) {
    if (kind === "container" && c.id === id) {
      if (c.imageId) related.add(imageKey(c.imageId));
      c.volumes.forEach((v) => related.add(volumeKey(v)));
    } else if ((kind === "image" && c.imageId === id) || (kind === "volume" && c.volumes.includes(id))) {
      related.add(containerKey(c.id));
    }
  }
  return related;
}
