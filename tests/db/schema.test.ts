import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  machines,
  orderItems,
  orders,
  printJobs,
  products,
  recipes,
  settings,
  stockItems,
  stockMovements,
} from "@/db/schema";
import { DEFAULT_SETTINGS, seed } from "@/db/seed";
import { setupTestDb } from "./helpers";

const { db, client } = setupTestDb();

const SPEC_TABLES = [
  "users",
  "machines",
  "recipes",
  "recipe_items",
  "products",
  "product_parts",
  "stock_items",
  "stock_movements",
  "print_jobs",
  "print_job_items",
  "print_job_filaments",
  "assemblies",
  "customers",
  "suppliers",
  "orders",
  "order_items",
  "payments",
  "expenses",
  "settings",
  "adjustments",
  "edit_log",
];
const COMMON = ["id", "created_at", "updated_at", "deleted_at", "notes", "extra"];

/** Postgres error code of a rejected statement (drizzle wraps the driver error in `cause`). */
async function pgError(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e as { code?: string; cause?: { code?: string } };
    return err.cause?.code ?? err.code ?? "unknown";
  }
  return "none";
}

async function makeRecipeAndPrinter() {
  const [printer] = await db.insert(machines).values({ name: "P1", type: "printer" }).returning();
  const [recipe] = await db
    .insert(recipes)
    .values({
      name: "R",
      fileBlobUrl: "mem://r",
      fileName: "r.gcode",
      fileSizeBytes: 1,
      fileSha256: "a".repeat(64),
      parser: "creality_print_gcode",
      parserVersion: "1",
    })
    .returning();
  return { printer: printer!, recipe: recipe! };
}

describe("F-01/F-02 migrations and tables", () => {
  it("has exactly the 21 spec tables, each with the six common columns", async () => {
    const rows = await client<
      { tablename: string }[]
    >`select tablename from pg_tables where schemaname = 'public' order by 1`;
    expect(rows.map((r) => r.tablename).sort()).toEqual([...SPEC_TABLES].sort());
    for (const t of SPEC_TABLES) {
      const cols = await client<
        { column_name: string }[]
      >`select column_name from information_schema.columns where table_schema = 'public' and table_name = ${t}`;
      expect(
        cols.map((c) => c.column_name),
        t,
      ).toEqual(expect.arrayContaining(COMMON));
    }
  });
  it("locks every table down for Supabase's Data API (RLS on, views security_invoker)", async () => {
    const rls = await client`select tablename from pg_tables where schemaname = 'public' and not rowsecurity`;
    expect(rls).toHaveLength(0);
    const views = await client<{ relname: string; reloptions: string[] | null }[]>`
      select c.relname, c.reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v'`;
    expect(views.length).toBe(5);
    for (const v of views) expect(v.reloptions, v.relname).toContain("security_invoker=true");
  });
});

describe("F-03 one running print per printer (D34)", () => {
  it("rejects a second unfinished job, allows it after finish or soft delete", async () => {
    const { printer, recipe } = await makeRecipeAndPrinter();
    const [first] = await db.insert(printJobs).values({ recipeId: recipe.id, machineId: printer.id }).returning();
    expect(await pgError(db.insert(printJobs).values({ recipeId: recipe.id, machineId: printer.id }))).toBe("23505");

    await db
      .update(printJobs)
      .set({ finishedAt: new Date(), hours: 1, hoursSource: "confirmed" })
      .where(sql`id = ${first!.id}`);
    const [second] = await db.insert(printJobs).values({ recipeId: recipe.id, machineId: printer.id }).returning();
    await db
      .update(printJobs)
      .set({ deletedAt: new Date() })
      .where(sql`id = ${second!.id}`);
    await db.insert(printJobs).values({ recipeId: recipe.id, machineId: printer.id });
  });
  it("a finished job must have hours and hours_source (D33)", async () => {
    const { printer, recipe } = await makeRecipeAndPrinter();
    expect(
      await pgError(
        db.insert(printJobs).values({ recipeId: recipe.id, machineId: printer.id, finishedAt: new Date() }),
      ),
    ).toBe("23514");
  });
});

describe("F-04 check constraints", () => {
  it("rejects a part with a sale price (D31)", async () => {
    expect(await pgError(db.insert(products).values({ name: "Clip", kind: "part", salePriceUsd: 2 }))).toBe("23514");
  });
  it("rejects a non-positive rate and a USD rate other than 1", async () => {
    expect(
      await pgError(
        client`insert into expenses (category, amount, currency, rate_to_usd) values ('other', 5, 'LBP', 0)`,
      ),
    ).toBe("23514");
    expect(
      await pgError(
        client`insert into expenses (category, amount, currency, rate_to_usd) values ('other', 5, 'USD', 0.5)`,
      ),
    ).toBe("23514");
  });
  it("rejects an unknown currency", async () => {
    expect(await pgError(client`insert into expenses (category, amount, currency) values ('other', 5, 'EUR')`)).toBe(
      "22P02",
    );
  });
  it("rejects reserving more than ordered", async () => {
    const [p] = await db.insert(products).values({ name: "Stand", salePriceUsd: 5 }).returning();
    const [o] = await db.insert(orders).values({}).returning();
    expect(
      await pgError(
        db.insert(orderItems).values({ orderId: o!.id, productId: p!.id, quantity: 2, unitPrice: 5, qtyReserved: 3 }),
      ),
    ).toBe("23514");
  });
  it("a + movement needs a unit cost; weigh-ins and counts don't", async () => {
    const [f] = await db.insert(stockItems).values({ name: "PLA Black", type: "filament", unit: "grams" }).returning();
    expect(
      await pgError(db.insert(stockMovements).values({ stockItemId: f!.id, amount: 1000, reason: "purchase" })),
    ).toBe("23514");
    await db.insert(stockMovements).values({ stockItemId: f!.id, amount: 12, reason: "weigh_in" });
  });
  it("D42 usernames are unique ignoring case", async () => {
    await client`insert into users (username, password_hash) values ('Joe', 'x')`;
    expect(await pgError(client`insert into users (username, password_hash) values ('joe', 'y')`)).toBe("23505");
  });
});

describe("F-05 seed is idempotent", () => {
  it("leaves one printer and one row per default setting after two runs", async () => {
    await seed(db);
    await seed(db);
    expect(await db.select().from(machines)).toHaveLength(1);
    const s = await db.select().from(settings);
    expect(s.map((r) => r.key).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
    const [printer] = await db.select().from(machines);
    expect(printer).toMatchObject({ avgPowerKw: 0.12, expectedLifeHours: 3000, bedXMm: 220, purchaseAmount: null });
    expect(s.find((r) => r.key === "electricity_kwh_price")).toBeUndefined();
  });
});

describe("F-06 stock views", () => {
  it("stock_on_hand and stock_available", async () => {
    const [f] = await db.insert(stockItems).values({ name: "PLA Black", type: "filament", unit: "grams" }).returning();
    await db.insert(stockMovements).values([
      { stockItemId: f!.id, amount: 1000, reason: "purchase", unitCostUsd: 0.0175 },
      { stockItemId: f!.id, amount: -29.22, reason: "print" },
      { stockItemId: f!.id, amount: -500, reason: "print", deletedAt: new Date() },
    ]);
    const [p] = await db.insert(products).values({ name: "Stand", salePriceUsd: 5 }).returning();
    const [si] = await db
      .insert(stockItems)
      .values({ name: "Stand", type: "finished_product", unit: "pieces", productId: p!.id })
      .returning();
    await db.insert(stockMovements).values({ stockItemId: si!.id, amount: 5, reason: "print", unitCostUsd: 0.87 });
    const [open] = await db.insert(orders).values({ status: "confirmed" }).returning();
    const [done] = await db.insert(orders).values({ status: "cancelled" }).returning();
    await db.insert(orderItems).values([
      { orderId: open!.id, productId: p!.id, quantity: 4, unitPrice: 5, qtyReserved: 3 },
      { orderId: done!.id, productId: p!.id, quantity: 2, unitPrice: 5, qtyReserved: 2 },
    ]);

    const onHand = await client<{ stock_item_id: number; on_hand: string }[]>`select * from stock_on_hand order by 1`;
    expect(onHand.map((r) => Number(r.on_hand))).toEqual([970.78, 5]);
    const [avail] = await client<
      { on_hand: string; reserved: string; available: string }[]
    >`select * from stock_available where stock_item_id = ${si!.id}`;
    expect([avail!.on_hand, avail!.reserved, avail!.available].map(Number)).toEqual([5, 3, 2]);
    const short = await client<{ need_to_print: number }[]>`select need_to_print from order_shortfall`;
    expect(short.map((r) => r.need_to_print)).toEqual([1]);
  });
});

describe("order_balance (D28, D37)", () => {
  it("unpaid, partly paid, courier-held, paid, refunded", async () => {
    const [p] = await db.insert(products).values({ name: "Stand", salePriceUsd: 5 }).returning();
    const [o] = await db.insert(orders).values({ deliveryCharge: 3 }).returning();
    await db.insert(orderItems).values({ orderId: o!.id, productId: p!.id, quantity: 2, unitPrice: 5 });
    const state = async () => {
      const [r] = await client<
        { total_usd: string; balance_due_usd: string; payment_state: string; held_by_courier_usd: string }[]
      >`select * from order_balance where order_id = ${o!.id}`;
      return [Number(r!.total_usd), Number(r!.balance_due_usd), r!.payment_state, Number(r!.held_by_courier_usd)];
    };
    expect(await state()).toEqual([10, 10, "unpaid", 0]); // delivery charge excluded (D37)
    await client`insert into payments (order_id, amount) values (${o!.id}, 4)`;
    expect(await state()).toEqual([10, 6, "partly_paid", 0]);
    await client`insert into payments (order_id, amount, method) values (${o!.id}, 6, 'courier_cod')`;
    expect(await state()).toEqual([10, 0, "paid", 6]);
    await client`insert into payments (order_id, amount) values (${o!.id}, -10)`;
    expect(await state()).toEqual([10, 10, "unpaid", 6]);
  });
});
