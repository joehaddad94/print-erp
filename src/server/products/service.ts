import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/db/schema";
import { products, stockItems } from "@/db/schema";
import { updateLogged } from "@/server/edits/engine";
import type { ProductInput } from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

export function productLabel(p: { name: string; variant: string | null }) {
  return p.variant ? `${p.name} (${p.variant})` : p.name;
}

export async function listProducts(db: Db) {
  return db
    .select({
      id: products.id,
      name: products.name,
      variant: products.variant,
      kind: products.kind,
      salePriceUsd: products.salePriceUsd,
      packagingName: stockItems.name,
      updatedAt: products.updatedAt,
      createdAt: products.createdAt,
      recipeCount: sql<number>`(select count(*)::int from recipe_items ri join recipes r on r.id = ri.recipe_id
        where ri.product_id = "products"."id" and ri.deleted_at is null and r.is_current and r.deleted_at is null)`,
    })
    .from(products)
    .leftJoin(stockItems, eq(stockItems.id, products.packagingItemId))
    .where(isNull(products.deletedAt))
    .orderBy(asc(products.kind), asc(products.name), asc(products.variant));
}

export async function getProduct(db: Db, id: number) {
  const [p] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), isNull(products.deletedAt)));
  return p ?? null;
}

export function packagingOptions(db: Db) {
  return db
    .select({ id: stockItems.id, name: stockItems.name })
    .from(stockItems)
    .where(and(eq(stockItems.type, "consumable"), isNull(stockItems.deletedAt)))
    .orderBy(asc(stockItems.name));
}

export async function createProduct(db: Db, i: ProductInput) {
  const [row] = await db.insert(products).values(i).returning({ id: products.id });
  return row!.id;
}

export async function updateProduct(db: Db, id: number, i: ProductInput, userId?: number) {
  return db.transaction((tx) => updateLogged(tx, products, id, i, { userId }));
}
