import { Routes, Route } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Dashboard } from "@/pages/Dashboard";
import { Containers } from "@/pages/Containers";
import { ContainerDetail } from "@/pages/ContainerDetail";
import { Compose } from "@/pages/Compose";
import { ComposeDetail } from "@/pages/ComposeDetail";
import { Images } from "@/pages/Images";
import { ImageDetail } from "@/pages/ImageDetail";
import { Volumes } from "@/pages/Volumes";
import { VolumeDetail } from "@/pages/VolumeDetail";
import { Logs } from "@/pages/Logs";
import { Tutorials } from "@/pages/Tutorials";
import { TutorialDetail } from "@/pages/TutorialDetail";
import { Commands } from "@/pages/Commands";
import { Settings } from "@/pages/Settings";
import { Migrate } from "@/pages/Migrate";
import { Console } from "@/pages/Console";
import { Network } from "@/pages/Network";
import { Registries } from "@/pages/Registries";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="containers" element={<Containers />} />
        <Route path="containers/:id" element={<ContainerDetail />} />
        <Route path="compose" element={<Compose />} />
        <Route path="compose/:name" element={<ComposeDetail />} />
        <Route path="images" element={<Images />} />
        <Route path="images/:id" element={<ImageDetail />} />
        <Route path="volumes" element={<Volumes />} />
        <Route path="volumes/:name" element={<VolumeDetail />} />
        <Route path="network" element={<Network />} />
        <Route path="registries" element={<Registries />} />
        <Route path="logs" element={<Logs />} />
        <Route path="learn" element={<Tutorials />} />
        <Route path="learn/:slug" element={<TutorialDetail />} />
        <Route path="commands" element={<Commands />} />
        <Route path="migrate" element={<Migrate />} />
        <Route path="console" element={<Console />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
