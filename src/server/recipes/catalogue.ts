import { and, eq, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/db/schema";
import { printJobs, recipes } from "@/db/schema";
import { costInputs } from "@/server/calculator/service";
import { productLabel } from "@/server/products/service";
import { recipeEstimate } from "./estimate";
import { listRecipes } from "./service";

type Db = PostgresJsDatabase<typeof schema>;

/**
 * Recipes table (prototype /recipes): current version of each recipe with what it makes, grams,
 * time, what one plate costs if printed now, and when any of its versions was last printed.
 */
export async function recipeTable(db: Db) {
  const [rows, inputs, used] = await Promise.all([
    listRecipes(db),
    costInputs(db),
    db
      .select({ group: recipes.recipeGroup, last: sql<string | null>`max(${printJobs.startedAt})` })
      .from(printJobs)
      .innerJoin(recipes, eq(recipes.id, printJobs.recipeId))
      .where(and(isNull(printJobs.deletedAt)))
      .groupBy(recipes.recipeGroup),
  ]);
  return rows.map((r) => {
    const est = recipeEstimate(r, r.items, inputs);
    const last = used.find((u) => u.group === r.recipeGroup)?.last;
    return {
      ...r,
      makes: r.items
        .map((i) => `${i.qtyOnPlate} × ${productLabel({ name: i.productName, variant: i.productVariant })}`)
        .join(", "),
      grams: est.grams,
      jobCostUsd: est.job?.total ?? null,
      lastUsed: last ? new Date(last) : null,
    };
  });
}

export type RecipeRow = Awaited<ReturnType<typeof recipeTable>>[number];
