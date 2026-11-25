import { Link } from "@/components/ui/link";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">Not found</h1>
      <p className="text-ink-muted">This page doesn&apos;t exist, or the entry was deleted.</p>
      <Link className={buttonClass("secondary")} href="/">
        Go to Today
      </Link>
    </main>
  );
}
