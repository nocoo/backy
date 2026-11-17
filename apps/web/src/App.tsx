import { Routes, Route } from "react-router";
import { AppLayout } from "./AppLayout";
import { DashboardPage } from "./pages/dashboard";
import { ProjectsPage } from "./pages/projects";
import { ProjectNewPage } from "./pages/project-new";
import { ProjectDetailPage } from "./pages/project-detail";
import { BackupsPage } from "./pages/backups";
import { BackupDetailPage } from "./pages/backup-detail";
import { LogsPage } from "./pages/logs";
import { CronLogsPage } from "./pages/cron-logs";

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/new" element={<ProjectNewPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/backups" element={<BackupsPage />} />
        <Route path="/backups/:id" element={<BackupDetailPage />} />
        <Route path="/logs" element={<LogsPage />} />
        <Route path="/cron-logs" element={<CronLogsPage />} />
        <Route path="*" element={<Placeholder name="Not found" />} />
      </Route>
    </Routes>
  );
}

function Placeholder({ name }: { name: string }) {
  return (
    <div className="font-sans">
      <h1 className="text-2xl font-semibold">{name}</h1>
      <p className="mt-2 text-basalt-muted-foreground">
        Wave D placeholder — page implementation lands in later sub-steps.
      </p>
    </div>
  );
}
