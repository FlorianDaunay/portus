import { Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { EngineSetup } from "@/components/EngineSetup";
import { ConnectionError } from "@/components/ui/ConnectionError";
import { getDaemonInfo } from "@/lib/api";

export function AppShell() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["daemon-info"],
    queryFn: getDaemonInfo,
    refetchInterval: 5000,
  });

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-6xl animate-fade-in">
            {isPending ? (
              <div className="flex justify-center pt-24 text-text-muted">
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : isError ? (
              <ConnectionError error={error} />
            ) : data.connected ? (
              <Outlet />
            ) : (
              <EngineSetup />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
