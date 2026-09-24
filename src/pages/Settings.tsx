import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Switch } from "@/components/ui/Switch";
import {
  getSettings,
  setKeepRunningInBackground,
  setLaunchAtStartup,
  setStartMinimized,
  setStopEngineOnExit,
} from "@/lib/api";
import type { Settings as AppSettings } from "@/lib/types";

function SettingRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-6 border-t border-border py-4 first:border-t-0 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <p className="mt-0.5 text-xs text-text-muted">{description}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={title} />
    </div>
  );
}

export function Settings() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });

  const save = (label: string, fn: (value: boolean) => Promise<AppSettings>) =>
    useMutation({
      mutationFn: fn,
      onSettled: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
      meta: { label },
    });
  const keepRunning = save("Save setting", setKeepRunningInBackground);
  const launch = save("Change startup setting", setLaunchAtStartup);
  const minimized = save("Save setting", setStartMinimized);
  const stopOnExit = save("Save setting", setStopEngineOnExit);
  const ready = !!settings;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-text-muted">How Portus behaves when you are not looking at it.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Background and startup</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingRow
            title="Keep running in the background"
            description="Closing the window hides Portus in the notification area (next to the clock) instead of quitting, so migrations keep going. Use the tray icon's menu to quit for real."
            checked={settings?.keepRunningInBackground ?? true}
            disabled={!ready || keepRunning.isPending}
            onChange={(v) => keepRunning.mutate(v)}
          />
          <SettingRow
            title="Launch Portus at login"
            description="Starts Portus with your session, so the tray icon is there from the beginning."
            checked={settings?.launchAtStartup ?? false}
            disabled={!ready || launch.isPending}
            onChange={(v) => launch.mutate(v)}
          />
          <SettingRow
            title="Start hidden when launched at login"
            description="Only the tray icon appears; open the window from it when you need it."
            checked={settings?.startMinimized ?? true}
            disabled={!ready || minimized.isPending || !settings?.launchAtStartup}
            onChange={(v) => minimized.mutate(v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Docker engine</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingRow
            title="Stop the WSL engine when Portus quits"
            description="Only applies to the engine Portus manages in WSL. Every container running in it is stopped. Off by default: the engine and its containers survive Portus closing."
            checked={settings?.stopEngineOnExit ?? false}
            disabled={!ready || stopOnExit.isPending}
            onChange={(v) => stopOnExit.mutate(v)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
