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
  return (
    <>
      {/*
        Persistent fallback title. Page metadata streams in after the static
        shell, so during a navigation the metadata <title> can be briefly
        absent; this one lives in the layout and never unmounts (axe
        document-title). React hoists it into <head>.
      */}
      <title>Print Shop</title>
      <AppShell>{children}</AppShell>
    </>
  );
}
