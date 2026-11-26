import type { Metadata } from "next";
import { Icon } from "@/components/shell/icons";
import { Card } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6 shadow-raised sm:p-8">
        <div className="flex items-center gap-2.5 pb-6">
          <span className="grid size-8 place-items-center rounded-md bg-action text-action-ink">
            <Icon name="machines" size={18} />
          </span>
          <h1 className="text-lg font-semibold">Print Shop</h1>
        </div>
        <LoginForm />
      </Card>
    </main>
  );
}
