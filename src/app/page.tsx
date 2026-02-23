import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Image from "next/image";

export default async function HomePage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <Image
          src="/logo-80.png"
          alt="Backy"
          width={64}
          height={64}
          className="rounded-2xl"
          priority
        />
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
