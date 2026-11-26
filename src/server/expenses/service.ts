import { and, asc, desc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/db/schema";
import { expenses, machines, stockItems, stockMovements, suppliers } from "@/db/schema";
import { rateToUsdFromLbpRate } from "@/lib/money";
import { lastEdited, softDeleteLogged, updateLogged } from "@/server/edits/engine";
import { recordMovement, replayAverages } from "@/server/stock/ledger";
import { isPurchase, type ExpenseInput } from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

const rateFor = (i: ExpenseInput) => (i.currency === "USD" ? 1 : rateToUsdFromLbpRate(i.lbpRate!));

/**
 * A filament brand as stored: reuses the spelling of a brand already entered, ignoring case
 * ("esun" saved after "eSun" is stored as "eSun"), so the same brand is never two brands.
 * Other categories never carry a brand. `exceptId` skips the expense being edited.
 */
async function canonicalBrand(db: Db, i: ExpenseInput, exceptId?: number) {
  if (i.category !== "filament" || !i.brand) return null;
  const [hit] = await db
    .select({ brand: expenses.brand })
    .from(expenses)
    .where(
      and(
        isNull(expenses.deletedAt),
        sql`lower(${expenses.brand}) = lower(${i.brand})`,
        exceptId == null ? undefined : ne(expenses.id, exceptId),
      ),
    )
    .orderBy(asc(expenses.id))
    .limit(1);
  return hit?.brand ?? i.brand;
}

/** Brands typed on filament purchases, most recently used first, one per brand (case-insensitive). */
export async function listFilamentBrands(db: Db) {
  const rows = await db
    .select({ brand: expenses.brand })
    .from(expenses)
    .where(and(isNull(expenses.deletedAt), isNotNull(expenses.brand)))
    .orderBy(desc(expenses.spentOn), desc(expenses.id));
  const seen = new Map<string, string>();
  for (const r of rows) if (r.brand && !seen.has(r.brand.toLowerCase())) seen.set(r.brand.toLowerCase(), r.brand);
  return [...seen.values()];
}

/**
 * D9: a purchase is entered once and creates the expense plus the stock (filament grams at
 * price per gram, packaging pieces) or the machine, in one transaction.
 */
export async function createExpense(db: Db, i: ExpenseInput) {
  return db.transaction(async (tx) => {
    const rateToUsd = rateFor(i);
    const usd = i.amount * rateToUsd;
    const [expense] = await tx
      .insert(expenses)
      .values({
        spentOn: i.spentOn,
        category: i.category,
        amount: i.amount,
        currency: i.currency,
        rateToUsd,
        supplierId: i.supplierId,
        notes: i.notes,
        description: i.description,
        paidTo: i.paidTo,
        repeatsMonthly: i.repeatsMonthly,
        brand: await canonicalBrand(tx, i),
      })
      .returning();

    if (i.category === "filament") {
      let filamentId = i.filamentId;
      if (filamentId == null) {
        const [item] = await tx
          .insert(stockItems)
          .values({
            name: `${i.newMaterial} ${i.newColor}`,
            type: "filament",
            unit: "grams",
            material: i.newMaterial,
            color: i.newColor,
            emptySpoolWeightG: i.emptySpoolWeightG,
          })
          .returning();
        filamentId = item!.id;
      }
      await tx.update(expenses).set({ stockItemId: filamentId }).where(eq(expenses.id, expense!.id));
      await recordMovement(tx, {
        stockItemId: filamentId,
        amount: i.grams!,
        reason: "purchase",
        unitCostUsd: usd / i.grams!,
        expenseId: expense!.id,
        movedAt: new Date(`${i.spentOn}T12:00:00Z`),
      });
    }

    if (i.category === "packaging") {
      let itemId = i.packagingId;
      if (itemId == null) {
        const [item] = await tx
          .insert(stockItems)
          .values({ name: i.newPackagingName!, type: "consumable", unit: "pieces" })
          .returning();
        itemId = item!.id;
      }
      await tx.update(expenses).set({ stockItemId: itemId }).where(eq(expenses.id, expense!.id));
      await recordMovement(tx, {
        stockItemId: itemId,
        amount: i.pieces!,
        reason: "purchase",
        unitCostUsd: usd / i.pieces!,
        expenseId: expense!.id,
        movedAt: new Date(`${i.spentOn}T12:00:00Z`),
      });
    }

    if (i.category === "machine") {
      const [machine] = await tx
        .insert(machines)
        .values({
          name: i.machineName!,
          type: i.machineType ?? "equipment",
          model: i.machineModel,
          boughtOn: i.spentOn,
          purchaseAmount: i.amount,
          purchaseCurrency: i.currency,
          purchaseRateToUsd: rateToUsd,
          expectedLifeHours: (i.machineType ?? "equipment") === "printer" ? 3000 : null,
        })
        .returning();
      await tx.update(expenses).set({ machineId: machine!.id }).where(eq(expenses.id, expense!.id));
    }
    return expense!.id;
  });
}

/**
 * D13 edit: same form; changed fields are logged. A purchase's grams or price also updates
 * its stock movement (logged) and replays the item's averages (plan §3.10).
 * The category and what was bought can't change on edit: delete and re-enter instead.
 */
export async function updateExpense(db: Db, id: number, i: ExpenseInput, userId?: number) {
  return db.transaction(async (tx) => {
    const rateToUsd = rateFor(i);
    const { row } = await updateLogged(
      tx,
      expenses,
      id,
      {
        spentOn: i.spentOn,
        amount: i.amount,
        currency: i.currency,
        rateToUsd,
        supplierId: i.supplierId,
        notes: i.notes,
        description: i.description,
        paidTo: i.paidTo,
        repeatsMonthly: i.repeatsMonthly,
        brand: await canonicalBrand(tx, i, id),
      },
      { userId },
    );
    const [movement] = await tx
      .select()
      .from(stockMovements)
      .where(and(eq(stockMovements.expenseId, id), isNull(stockMovements.deletedAt)));
    if (movement) {
      const qty = row.category === "filament" ? i.grams : row.category === "packaging" ? i.pieces : null;
      if (qty != null) {
        await updateLogged(
          tx,
          stockMovements,
          movement.id,
          { amount: qty, unitCostUsd: (i.amount * rateToUsd) / qty, movedAt: new Date(`${i.spentOn}T12:00:00Z`) },
          { userId },
        );
        await replayAverages(tx, movement.stockItemId);
      }
    }
    if (row.machineId) {
      await updateLogged(
        tx,
        machines,
        row.machineId,
        { purchaseAmount: i.amount, purchaseCurrency: i.currency, purchaseRateToUsd: rateToUsd, boughtOn: i.spentOn },
        { userId },
      );
    }
  });
}

/** D13 delete: soft, logged; its stock movement goes too and averages are replayed. */
export async function deleteExpense(db: Db, id: number, userId?: number) {
  return db.transaction(async (tx) => {
    const [e] = await tx.select({ category: expenses.category }).from(expenses).where(eq(expenses.id, id));
    await softDeleteLogged(tx, expenses, id, { userId });
    const moves = await tx
      .select()
      .from(stockMovements)
      .where(and(eq(stockMovements.expenseId, id), isNull(stockMovements.deletedAt)));
    for (const m of moves) {
      await softDeleteLogged(tx, stockMovements, m.id, { userId });
      await replayAverages(tx, m.stockItemId);
    }
    return e?.category ?? null;
  });
}

export async function listExpenses(db: Db) {
  const rows = await db
    .select({
      expense: expenses,
      supplierName: suppliers.name,
      itemName: stockItems.name,
      unit: stockItems.unit,
      machineName: machines.name,
      qty: stockMovements.amount,
    })
    .from(expenses)
    .leftJoin(stockMovements, and(eq(stockMovements.expenseId, expenses.id), isNull(stockMovements.deletedAt)))
    .leftJoin(suppliers, eq(suppliers.id, expenses.supplierId))
    .leftJoin(stockItems, eq(stockItems.id, expenses.stockItemId))
    .leftJoin(machines, eq(machines.id, expenses.machineId))
    .where(isNull(expenses.deletedAt))
    .orderBy(desc(expenses.spentOn), desc(expenses.id));
  const edited = await lastEdited(
    db,
    "expenses",
    rows.map((r) => r.expense.id),
  );
  return rows.map((r) => ({
    ...r.expense,
    supplierName: r.supplierName,
    boughtName: r.itemName ?? r.machineName,
    isPurchase: isPurchase(r.expense.category),
    purchaseQty: r.qty,
    unit: r.unit,
    editedAt: edited.get(r.expense.id) ?? null,
  }));
}

/** Expense plus its purchase quantity, for the edit form. */
export async function getExpense(db: Db, id: number) {
  const [e] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, id), isNull(expenses.deletedAt)));
  if (!e) return null;
  const [m] = await db
    .select()
    .from(stockMovements)
    .where(and(eq(stockMovements.expenseId, id), isNull(stockMovements.deletedAt)));
  return { ...e, purchaseQty: m?.amount ?? null };
}

export function filamentsAndPackaging(db: Db) {
  return db
    .select({ id: stockItems.id, name: stockItems.name, type: stockItems.type })
    .from(stockItems)
    .where(and(isNull(stockItems.deletedAt)))
    .orderBy(asc(stockItems.name));
}
