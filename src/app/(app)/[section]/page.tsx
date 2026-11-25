import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { ALL_ITEMS, findSection } from "@/components/shell/nav";

/** Placeholder for screens not built yet. A real route at the same path replaces it automatically. */
export function generateStaticParams() {
  return ALL_ITEMS.filter((i) => i.href !== "/").map((i) => ({ section: i.href.slice(1) }));
}

export default async function SectionPlaceholder({ params }: PageProps<"/[section]">) {
  const { section } = await params;
  const item = findSection(section);
  if (!item) notFound();
  return (
    <div className="flex max-w-content flex-col gap-6">
      <h1 className="text-xl font-bold">{item.label}</h1>
      <Card>
        <p className="text-ink-muted">This screen arrives in milestone {item.milestone}.</p>
      </Card>
    </div>
  );
}
