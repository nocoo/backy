import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { HardDrive } from "lucide-react";

export default async function HomePage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <HardDrive className="h-8 w-8 text-primary" strokeWidth={1.5} />
        </div>
        <h1 className="text-2xl font-semibold text-foreground">Backy</h1>
        <p className="text-sm text-muted-foreground">
          Welcome, {session.user?.name ?? session.user?.email}
        </p>
        <p className="text-xs text-muted-foreground/60">
          Dashboard coming soon
        </p>
      </div>
    </div>
  );
}
