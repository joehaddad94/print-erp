import { PageSkeleton } from "@/components/ui/skeleton";

/** Shown instantly on every navigation inside the app while the screen's data streams in. */
export default function Loading() {
  return <PageSkeleton />;
}
