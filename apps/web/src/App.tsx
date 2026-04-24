import { Routes, Route } from "react-router";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Placeholder name="Dashboard" />} />
      <Route path="/projects" element={<Placeholder name="Projects" />} />
      <Route path="/projects/new" element={<Placeholder name="New project" />} />
      <Route path="/projects/:id" element={<Placeholder name="Project detail" />} />
      <Route path="/backups" element={<Placeholder name="Backups" />} />
      <Route path="/backups/:id" element={<Placeholder name="Backup detail" />} />
      <Route path="/logs" element={<Placeholder name="Webhook logs" />} />
      <Route path="/cron-logs" element={<Placeholder name="Cron logs" />} />
      <Route path="*" element={<Placeholder name="Not found" />} />
    </Routes>
  );
}

function Placeholder({ name }: { name: string }) {
  return (
    <div className="p-8 font-sans">
      <h1 className="text-2xl font-semibold">{name}</h1>
      <p className="text-muted-foreground mt-2">
        Wave D placeholder — page implementation lands in later sub-steps.
      </p>
    </div>
  );
}
