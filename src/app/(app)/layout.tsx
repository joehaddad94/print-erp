import type { ReactNode } from "react";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { requireUser } from "@/server/auth/session";

async function Guarded({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return <AppShell username={user.username}>{children}</AppShell>;
}

/** Every signed-in screen lives under this layout, which checks the session (D42). */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <Guarded>{children}</Guarded>
    </Suspense>
  );
}
