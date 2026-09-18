import { WifiOff } from "lucide-react";
import { EmptyState } from "./EmptyState";

export function ConnectionError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Could not reach the Docker daemon.";
  return <EmptyState icon={WifiOff} title="Can't reach Docker" description={message} />;
}
