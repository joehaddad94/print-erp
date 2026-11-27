import type { Metadata } from "next";
import { Suspense } from "react";
import { ShopName } from "@/components/shell/shop-name";
import { Icon } from "@/components/shell/icons";
import { Card } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

/** Sign in (prototype /login): shop name, "Sign in", then the card. Username and password only (D41). */
export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-md font-semibold">
            <span className="grid size-6 place-items-center rounded-md bg-action text-action-ink">
              <Icon name="machines" size={14} />
            </span>
            <Suspense fallback="Print Shop">
              <ShopName />
            </Suspense>
          </p>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Sign in</h1>
            <p className="text-sm text-ink-muted">Username and password. No email needed.</p>
          </div>
        </div>
        <Card className="p-5 shadow-raised">
          <LoginForm />
        </Card>
      </div>
    </main>
  );
}
