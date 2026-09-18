import { WifiOff } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { errorMessage } from "@/lib/utils";

export function ConnectionError({ error }: { error: unknown }) {
  return <EmptyState icon={WifiOff} title="Can't reach Docker" description={errorMessage(error)} />;
}
