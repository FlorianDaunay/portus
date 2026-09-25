import type { QueryClient } from "@tanstack/react-query";

let suppressed = false;

/** After the user stops Docker on purpose, the setup screen must not restart it on its own. */
export const isEngineAutoStartSuppressed = () => suppressed;
export const setEngineAutoStartSuppressed = (value: boolean) => {
  suppressed = value;
};

/**
 * After switching the engine, everything cached belongs to the previous one. Reset (not just
 * invalidate) so pages show a loader instead of the old engine's data while the new one answers.
 */
export function refreshAfterEngineSwitch(queryClient: QueryClient) {
  queryClient.resetQueries({ predicate: (q) => q.queryKey[0] !== "settings" });
  queryClient.invalidateQueries({ queryKey: ["settings"] });
}
