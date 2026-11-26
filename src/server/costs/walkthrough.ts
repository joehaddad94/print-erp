import { and, asc, count, desc, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/db/schema";
import { orderItems, orders, printJobs, products, stockItems, stockMovements } from "@/db/schema";
import { getJob } from "@/server/printing/service";
import { currentSettings } from "@/server/settings/service";

type Db = PostgresJsDatabase<typeof schema>;
const num = (v: unknown) => (typeof v === "number" ? v : null);

/** The purchase that set a filament's average before `at`: what was there, what came in, the new average. */
async function lastPurchase(db: Db, stockItemId: number, at: Date) {
  const [m] = await db
    .select()
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.stockItemId, stockItemId),
        isNull(stockMovements.deletedAt),
        eq(stockMovements.reason, "purchase"),
        sql`${stockMovements.movedAt} <= ${at.toISOString()}`,
      ),
    )
    .orderBy(desc(stockMovements.movedAt), desc(stockMovements.id))
    .limit(1);
  if (!m || m.unitCostUsd == null || m.avgUnitCostAfterUsd == null) return null;
  const earlier = or(
    lt(stockMovements.movedAt, m.movedAt),
    and(eq(stockMovements.movedAt, m.movedAt), lt(stockMovements.id, m.id)),
  );
  const base = and(eq(stockMovements.stockItemId, stockItemId), isNull(stockMovements.deletedAt), earlier);
  const [had] = await db
    .select({ g: sql<string>`coalesce(sum(${stockMovements.amount}), 0)` })
    .from(stockMovements)
    .where(base);
  const [prev] = await db
    .select({ avg: stockMovements.avgUnitCostAfterUsd })
    .from(stockMovements)
    .where(and(base, isNotNull(stockMovements.avgUnitCostAfterUsd)))
    .orderBy(desc(stockMovements.movedAt), desc(stockMovements.id))
    .limit(1);
  return {
    hadGrams: Math.max(0, Number(had!.g)),
    hadAvg: prev?.avg ?? null,
    boughtGrams: m.amount,
    boughtUsd: m.amount * m.unitCostUsd,
    avgAfter: m.avgUnitCostAfterUsd,
    expenseId: m.expenseId,
  };
}

/** The print's batch going into stock: what was there before at what average, and the new average. */
async function stockStep(db: Db, jobId: number, itemLineId: number) {
  const [m] = await db
    .select({ m: stockMovements, name: stockItems.name })
    .from(stockMovements)
    .innerJoin(stockItems, eq(stockItems.id, stockMovements.stockItemId))
    .where(
      and(
        eq(stockMovements.printJobId, jobId),
        eq(stockMovements.printJobItemId, itemLineId),
        isNull(stockMovements.deletedAt),
      ),
    )
    .limit(1);
  if (!m || m.m.amount <= 0 || m.m.avgUnitCostAfterUsd == null) return null;
  const earlier = or(
    lt(stockMovements.movedAt, m.m.movedAt),
    and(eq(stockMovements.movedAt, m.m.movedAt), lt(stockMovements.id, m.m.id)),
  );
  const base = and(eq(stockMovements.stockItemId, m.m.stockItemId), isNull(stockMovements.deletedAt), earlier);
  const [had] = await db
    .select({ n: sql<string>`coalesce(sum(${stockMovements.amount}), 0)` })
    .from(stockMovements)
    .where(base);
  const [prev] = await db
    .select({ avg: stockMovements.avgUnitCostAfterUsd })
    .from(stockMovements)
    .where(and(base, isNotNull(stockMovements.avgUnitCostAfterUsd)))
    .orderBy(desc(stockMovements.movedAt), desc(stockMovements.id))
    .limit(1);
  return {
    name: m.name,
    had: Math.max(0, Number(had!.n)),
    hadAvg: prev?.avg ?? null,
    added: m.m.amount,
    addedCost: m.m.unitCostUsd,
    avgAfter: m.m.avgUnitCostAfterUsd,
  };
}

/**
 * R9 How costs work (owner only, view only): every cost step worked through with real numbers
 * from the latest finished print with a complete cost, and the latest delivered sale.
 * Reads only; nothing here changes a value.
 */
export async function costWalkthrough(db: Db) {
  const s = await currentSettings(db);
  const settings = {
    kwh: num(s.electricity_kwh_price),
    allowancePct: num(s.failure_allowance_pct) ?? 12,
    actualAfter: num(s.failure_actual_after_prints) ?? 20,
  };
  const [finished] = await db
    .select({ n: count() })
    .from(printJobs)
    .where(and(isNotNull(printJobs.finishedAt), isNull(printJobs.deletedAt)));
  const [latest] = await db
    .select({ id: printJobs.id })
    .from(printJobs)
    .where(and(isNotNull(printJobs.finishedAt), isNull(printJobs.deletedAt), isNotNull(printJobs.jobCostUsd)))
    .orderBy(desc(printJobs.finishedAt), desc(printJobs.id))
    .limit(1);
  const job = latest ? await getJob(db, latest.id) : null;
  if (!job) return { settings, finishedPrints: finished?.n ?? 0, job: null, sale: null };

  const hours = job.hours ?? 0;
  const filaments = await Promise.all(
    job.filaments.map(async (f) => ({
      name: f.name,
      grams: f.line.gramsUsed,
      source: f.line.gramsSource,
      perGram: f.line.costPerGramUsd ?? 0,
      purchase: await lastPurchase(db, f.line.filamentId, job.startedAt),
    })),
  );
  const filamentUsd = filaments.reduce((a, f) => a + f.grams * f.perGram, 0);
  const electricityUsd = (job.printerPowerKw ?? 0) * hours * (job.electricityKwhPriceUsd ?? 0);
  const wearUsd = hours * (job.machineCostPerHourUsd ?? 0);
  const items = job.items.map((i) => ({
    lineId: i.line.id,
    productId: i.line.productId,
    name: [i.productName, i.productVariant].filter(Boolean).join(" "),
    planned: i.line.qtyPlanned,
    good: i.line.qtyGood ?? 0,
    gramsPerPiece: i.line.gramsPerPiece,
    share: i.line.costShareUsd ?? 0,
    gramsShare: i.line.gramsShare ?? 0,
    unitCost: i.line.unitCostUsd,
    waste: i.line.wasteCostUsd ?? 0,
    labourMinutes: i.line.labourMinutesPerUnit,
  }));
  const first = items.find((i) => i.good > 0) ?? items[0]!;
  const stock = await stockStep(db, job.id, first.lineId);

  // Latest delivered sale of that product, else of anything.
  const saleQuery = (productId?: number) =>
    db
      .select({ line: orderItems, order: orders, name: products.name, variant: products.variant })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .innerJoin(products, eq(products.id, orderItems.productId))
      .where(
        and(
          eq(orders.status, "delivered"),
          isNull(orders.deletedAt),
          isNull(orderItems.deletedAt),
          isNotNull(orderItems.unitCostUsd),
          productId ? eq(orderItems.productId, productId) : undefined,
        ),
      )
      .orderBy(desc(orders.deliveredAt), desc(orderItems.id), asc(orders.id))
      .limit(1);
  const [sold] = (await saleQuery(first.productId)).length ? await saleQuery(first.productId) : await saleQuery();
  const sale = sold
    ? (() => {
        const priceUsd = sold.line.unitPrice * sold.order.rateToUsd;
        const pack = sold.line.packagingCostPerUnitUsd ?? 0;
        const profit = sold.line.quantity * (priceUsd - sold.line.unitCostUsd! - pack);
        const minutes =
          sold.line.labourMinutesPerUnit == null ? null : sold.line.labourMinutesPerUnit * sold.line.quantity;
        return {
          orderId: sold.order.id,
          name: [sold.name, sold.variant].filter(Boolean).join(" "),
          qty: sold.line.quantity,
          priceUsd,
          currency: sold.order.currency,
          unitCost: sold.line.unitCostUsd!,
          packaging: pack,
          profit,
          minutes,
          perHour: minutes ? profit / (minutes / 60) : null,
        };
      })()
    : null;

  return {
    settings,
    finishedPrints: finished?.n ?? 0,
    job: {
      id: job.id,
      recipeId: job.recipeId,
      recipeName: job.recipe.name,
      machine: {
        id: job.machine.id,
        name: job.machine.name,
        priceUsd:
          job.machine.purchaseAmount == null ? null : job.machine.purchaseAmount * job.machine.purchaseRateToUsd,
        lifeHours: job.machine.expectedLifeHours,
      },
      hours,
      stoppedAtPct: job.stoppedAtPct,
      powerKw: job.printerPowerKw,
      kwh: job.electricityKwhPriceUsd,
      perHour: job.machineCostPerHourUsd,
      method: job.failureMethod ?? "allowance",
      allowancePct: job.failureAllowancePct ?? settings.allowancePct,
      filaments,
      filamentUsd,
      electricityUsd,
      wearUsd,
      total: job.jobCostUsd ?? filamentUsd + electricityUsd + wearUsd,
      waste: job.wasteCostUsd ?? 0,
      items,
      first,
      stock,
    },
    sale,
  };
}

export type CostWalkthrough = Awaited<ReturnType<typeof costWalkthrough>>;
