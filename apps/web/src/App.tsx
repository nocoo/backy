import { Routes, Route } from "react-router";
import { AppLayout } from "./AppLayout";
import { DashboardPage } from "./pages/dashboard";
import { ProjectsPage } from "./pages/projects";
import { ProjectNewPage } from "./pages/project-new";
import { ProjectDetailPage } from "./pages/project-detail";
import { Toaster } from "./components/ui/sonner";

export function App() {
  return (
    <>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/new" element={<ProjectNewPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/backups" element={<Placeholder name="Backups" />} />
          <Route
            path="/backups/:id"
            element={<Placeholder name="Backup detail" />}
          />
          <Route path="/logs" element={<Placeholder name="Webhook logs" />} />
          <Route
            path="/cron-logs"
            element={<Placeholder name="Cron logs" />}
          />
          <Route path="*" element={<Placeholder name="Not found" />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  );
}

function Placeholder({ name }: { name: string }) {
  return (
    <div className="font-sans">
      <h1 className="text-2xl font-semibold">{name}</h1>
      <p className="mt-2 text-muted-foreground">
        Wave D placeholder — page implementation lands in later sub-steps.
      </p>
    </div>
  );
}
