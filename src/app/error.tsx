"use client";

import { useEffect } from "react";

/** Last-resort boundary (e.g. the signed-in layout can't reach the database): a message instead of a blank page. */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="text-ink-muted">
        Nothing was changed. This is usually the database connection. Try again in a minute.
        {error.digest ? <span className="block pt-1 text-xs">Reference: {error.digest}</span> : null}
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex min-h-control min-w-control items-center justify-center rounded-md bg-action px-4 font-bold text-action-ink"
      >
        Try again
      </button>
    </main>
  );
}
