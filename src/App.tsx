import { Routes, Route } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Dashboard } from "@/pages/Dashboard";
import { Containers } from "@/pages/Containers";
import { ContainerDetail } from "@/pages/ContainerDetail";
import { Compose } from "@/pages/Compose";
import { Images } from "@/pages/Images";
import { Volumes } from "@/pages/Volumes";
import { Logs } from "@/pages/Logs";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="containers" element={<Containers />} />
        <Route path="containers/:id" element={<ContainerDetail />} />
        <Route path="compose" element={<Compose />} />
        <Route path="images" element={<Images />} />
        <Route path="volumes" element={<Volumes />} />
        <Route path="logs" element={<Logs />} />
      </Route>
    </Routes>
  );
}
