"use client";

import { Link } from "@/components/ui/link";
import { useEffect } from "react";
import { Button, Callout, buttonClass } from "@/components/ui";

/**
 * Shown when a screen fails to load (e.g. the database is unreachable). Forms never land here:
 * every Server Action catches its own errors and returns the typed values (D41).
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex flex-col gap-4">
      <Callout tone="danger" title="This screen couldn't load">
        Nothing was changed. Check your connection, then try again.
        {error.digest ? <span className="block pt-1 text-xs">Reference: {error.digest}</span> : null}
      </Callout>
      <div className="flex flex-wrap gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link className={buttonClass("secondary")} href="/">
          Go to Today
        </Link>
      </div>
    </div>
  );
}
