import { and, asc, eq, isNull } from "drizzle-orm";
import { Link } from "@/components/ui/link";
import { AssembleForm } from "@/components/assembly/assemble-form";
import { Card, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { db } from "@/db";
import { products } from "@/db/schema";
import { assemblyPlan } from "@/server/assembly/service";
import { requireUser } from "@/server/auth/session";
import { productLabel } from "@/server/products/service";

export default async function AssemblePage() {
  await requireUser();
  const rows = await db()
    .select()
    .from(products)
    .where(and(eq(products.kind, "product"), isNull(products.deletedAt)))
    .orderBy(asc(products.name));
  const withParts = (
    await Promise.all(
      rows.map(async (p) => ({
        id: p.id,
        label: productLabel(p),
        parts: (await assemblyPlan(db(), p.id, 1)).map((x) => ({
          name: productLabel(x),
          qtyPerProduct: x.qtyPerProduct,
          onHand: x.onHand,
        })),
      })),
    )
  ).filter((p) => p.parts.length > 0);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" });
  return (
    <div className="flex max-w-content flex-col gap-6">
      <PageHeader title="Assemble" />
      {withParts.length === 0 ? (
        <EmptyState title="No product has a parts list yet">
          <Link href="/products" className={buttonClass("secondary")}>
            Add parts to a product
          </Link>
        </EmptyState>
      ) : (
        <Card>
          <AssembleForm products={withParts} today={today} />
        </Card>
      )}
    </div>
  );
}
