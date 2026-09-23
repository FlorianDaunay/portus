import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { EngineSetup } from "@/components/EngineSetup";
import { ConnectionError } from "@/components/ui/ConnectionError";
import { getDaemonInfo, getSettings } from "@/lib/api";
import { useMetrics } from "@/lib/metrics";

/** Pages that teach or take notes and don't need a running engine. */
const offlineRoutes = ["/learn", "/commands"];

export function AppShell() {
  const { pathname } = useLocation();
  const offline = offlineRoutes.some((r) => pathname === r || pathname.startsWith(`${r}/`));
  const { data, dataUpdatedAt, isPending, isError, error } = useQuery({
    queryKey: ["daemon-info"],
    queryFn: getDaemonInfo,
    refetchInterval: 5000,
  });

  const { data: settings, isPending: settingsPending } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  // Changing the engine restarts the setup flow from scratch.
  const engineKey = `${settings?.engineSource}|${settings?.customEndpoint}|${settings?.customTlsDir}`;

  // The dashboard charts show how the load evolved, so sample here, whatever page is open.
  const record = useMetrics((s) => s.record);
  useEffect(() => {
    if (!data?.connected) return;
    record({
      t: dataUpdatedAt,
      cpu: data.cpuPercent,
      mem: data.memTotalMb > 0 ? (data.memUsedMb / data.memTotalMb) * 100 : 0,
      memUsedMb: data.memUsedMb,
      memTotalMb: data.memTotalMb,
    });
  }, [data, dataUpdatedAt, record]);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-6xl animate-fade-in">
            {offline ? (
              <Outlet />
            ) : isPending || (settingsPending && !isError) ? (
              <div className="flex justify-center pt-24 text-text-muted">
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : isError ? (
              <ConnectionError error={error} />
            ) : data.connected ? (
              <Outlet />
            ) : (
              <EngineSetup key={engineKey} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
