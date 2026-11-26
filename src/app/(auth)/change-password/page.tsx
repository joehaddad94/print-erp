import type { Metadata } from "next";
import { Suspense } from "react";
import { ChangePasswordForm } from "@/components/people/change-password-form";
import { Card, Skeleton } from "@/components/ui";
import { requireSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Change password" };

/** R1: after an app-generated password (new person or reset), and from Settings → Your account. */
export default function ChangePasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Card className="flex w-full max-w-sm flex-col gap-4 p-6 shadow-raised sm:p-8">
        <Suspense fallback={<Skeleton className="h-64" />}>
          <ChangePassword />
        </Suspense>
      </Card>
    </main>
  );
}

async function ChangePassword() {
  const me = await requireSession();
  return (
    <>
      <div>
        <h1 className="text-lg font-semibold">{me.mustChangePassword ? "Choose your password" : "Change password"}</h1>
        <p className="pt-1 text-sm text-ink-muted">
          {me.mustChangePassword
            ? `Signed in as ${me.username} with a one-time password. Pick your own to continue.`
            : `Signed in as ${me.username}.`}
        </p>
      </div>
      <ChangePasswordForm username={me.username} />
    </>
  );
}
