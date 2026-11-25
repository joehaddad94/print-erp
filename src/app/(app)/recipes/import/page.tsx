import { and, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ImportForm } from "@/components/recipes/import-form";
import { Callout, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { recipes } from "@/db/schema";
import { requireUser } from "@/server/auth/session";
import { itemsFor } from "@/server/recipes/service";
import { importOptions } from "../options";

export default async function ImportRecipePage({ searchParams }: PageProps<"/recipes/import">) {
  await requireUser();
  const groupParam = (await searchParams).group;
  const opts = await importOptions();
  if (process.env.VERCEL && opts.mode === "local") {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Import G-code" />
        <Callout tone="warning" title="File storage isn't connected">
          Connect a Vercel Blob store to this project (Storage tab in Vercel), then redeploy. The cost calculator works
          without it.
        </Callout>
      </div>
    );
  }
  let group;
  if (typeof groupParam === "string" && /^[0-9a-f-]{36}$/.test(groupParam)) {
    const [current] = await db()
      .select({ id: recipes.id, name: recipes.name, recipeGroup: recipes.recipeGroup })
      .from(recipes)
      .where(and(eq(recipes.recipeGroup, groupParam), eq(recipes.isCurrent, true), isNull(recipes.deletedAt)));
    if (!current) notFound();
    const items = await itemsFor(db(), [current.id]);
    group = {
      recipeGroup: current.recipeGroup,
      name: current.name,
      items: items.map((i) => ({ objectName: i.objectName, productId: i.productId })),
    };
  }
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={group ? `New version of ${group.name}` : "Import G-code"} />
      <ImportForm {...opts} group={group} />
    </div>
  );
}
