import { Routes, Route } from "react-router";
import { AppLayout } from "./AppLayout";

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Placeholder name="Dashboard" />} />
        <Route path="/projects" element={<Placeholder name="Projects" />} />
        <Route
          path="/projects/new"
          element={<Placeholder name="New project" />}
        />
        <Route
          path="/projects/:id"
          element={<Placeholder name="Project detail" />}
        />
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
