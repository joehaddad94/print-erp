import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";

/**
 * Every signed-in screen lives under this layout. The shell itself is static
 * (no session or database read) so navigations can show it instantly.
 *
 * Security (D42) does not depend on the shell: proxy.ts sends cookie-less
 * requests to /login, and every page that reads data and every Server Action
 * calls requireUser() itself (enforced by tests/unit/actions-guarded.test.ts).
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
