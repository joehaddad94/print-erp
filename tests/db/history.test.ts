import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { customers, editLog, products } from "@/db/schema";
import { createPerson, setPassword } from "@/server/auth/service";
import { historyFeed, logPeopleChange, restoreChange } from "@/server/history/service";
import { createCustomer, updateCustomer } from "@/server/orders/service";
import { productSchema } from "@/server/products/schema";
import { createProduct, updateProduct } from "@/server/products/service";
import { currentSettings, setSetting } from "@/server/settings/service";
import { softDeleteLogged } from "@/server/edits/engine";
import { setupTestDb } from "./helpers";

const { db } = setupTestDb();

const product = (salePriceUsd: string, name = "Clip") => productSchema.parse({ name, kind: "product", salePriceUsd });

describe("R2 change history feed", () => {
  it("shows who, area, item name, field label, before and after, newest first", async () => {
    const joe = await setPassword(db, "joe", "correct horse battery");
    const id = await createProduct(db, product("2"));
    await updateProduct(db, id, product("3"), joe);
    const [row] = await historyFeed(db);
    expect(row).toMatchObject({
      who: "joe",
      area: "stock",
      item: "Clip",
      href: `/products/${id}`,
      what: "Sale price",
      before: 2,
      after: 3,
      restorable: true,
    });
  });

  it("filters by area, person, period and search", async () => {
    const joe = await setPassword(db, "joe", "correct horse battery");
    const rami = await createPerson(db, "rami", "staff");
    if (!rami.ok) throw new Error("create failed");
    const p = await createProduct(db, product("2"));
    await updateProduct(db, p, product("3"), joe);
    const c = await createCustomer(db, { name: "Maya", phone: null, handle: null, notes: null });
    await updateCustomer(db, c, { name: "Maya K", phone: null, handle: null, notes: null }, rami.id);
    expect((await historyFeed(db, { area: "sales" })).map((r) => r.item)).toEqual(["Maya K"]);
    expect((await historyFeed(db, { who: rami.id })).map((r) => r.what)).toEqual(["Name"]);
    expect(await historyFeed(db, { since: new Date(Date.now() + 60_000) })).toEqual([]);
    expect((await historyFeed(db, { q: "maya" })).map((r) => r.item)).toEqual(["Maya K"]);
  });

  it("settings and people changes appear too, and no password is ever stored", async () => {
    const joe = await setPassword(db, "joe", "correct horse battery");
    await setSetting(db, "electricity_kwh_price", 0.6, new Date(), { userId: joe });
    await setSetting(db, "electricity_kwh_price", 0.64, new Date(), { userId: joe });
    const r = await createPerson(db, "rami", "staff");
    if (!r.ok) throw new Error("create failed");
    await logPeopleChange(db, { userId: r.id, actorId: joe, field: "password", after: "One-time password" });
    const feed = await historyFeed(db, { area: "settings" });
    expect(feed.map((x) => [x.item, x.before, x.after])).toEqual([
      ["rami", null, "One-time password"],
      ["Electricity per kWh", 0.6, 0.64],
      ["Electricity per kWh", null, 0.6],
    ]);
    expect(JSON.stringify(await db.select().from(editLog))).not.toContain(r.password);
  });
});

describe("R2 restore", () => {
  it("puts the old value back as a new logged change", async () => {
    const joe = await setPassword(db, "joe", "correct horse battery");
    const id = await createProduct(db, product("2"));
    await updateProduct(db, id, product("3"), joe);
    const [change] = await historyFeed(db);
    expect(await restoreChange(db, change!.id, joe)).toEqual({ ok: true });
    const [p] = await db.select().from(products).where(eq(products.id, id));
    expect(Number(p!.salePriceUsd)).toBe(2);
    const feed = await historyFeed(db);
    expect(feed).toHaveLength(2);
    expect(feed[0]).toMatchObject({ before: 3, after: 2, reason: `Restored change #${change!.id}`, who: "joe" });
  });

  it("refuses when the value was changed again since", async () => {
    const joe = await setPassword(db, "joe", "correct horse battery");
    const id = await createProduct(db, product("2"));
    await updateProduct(db, id, product("3"), joe);
    await updateProduct(db, id, product("4"), joe);
    const older = (await historyFeed(db)).at(-1)!;
    expect(await restoreChange(db, older.id, joe)).toMatchObject({ ok: false, error: expect.stringMatching(/again/) });
  });

  it("brings back a deleted customer", async () => {
    const joe = await setPassword(db, "joe", "correct horse battery");
    const c = await createCustomer(db, { name: "Maya", phone: null, handle: null, notes: null });
    await db.transaction((tx) => softDeleteLogged(tx, customers, c, { userId: joe }));
    const [del] = await historyFeed(db);
    expect(del).toMatchObject({ what: "Deleted", restorable: true });
    expect(await restoreChange(db, del!.id, joe)).toEqual({ ok: true });
    const [row] = await db.select().from(customers).where(eq(customers.id, c));
    expect(row!.deletedAt).toBeNull();
    expect(await restoreChange(db, del!.id, joe)).toMatchObject({ ok: false });
  });

  it("restores a setting", async () => {
    const joe = await setPassword(db, "joe", "correct horse battery");
    await setSetting(db, "electricity_kwh_price", 0.6, new Date(Date.now() - 1000), { userId: joe });
    await setSetting(db, "electricity_kwh_price", 0.64, new Date(Date.now() - 500), { userId: joe });
    const [latest] = await historyFeed(db, { area: "settings" });
    expect(await restoreChange(db, latest!.id, joe)).toEqual({ ok: true });
    expect((await currentSettings(db)).electricity_kwh_price).toBe(0.6);
  });

  it("people changes and unknown fields can't be restored", async () => {
    const joe = await setPassword(db, "joe", "correct horse battery");
    await logPeopleChange(db, { userId: joe, actorId: joe, field: "password", after: "One-time password" });
    const [row] = await historyFeed(db);
    expect(row!.restorable).toBe(false);
    expect(await restoreChange(db, row!.id, joe)).toMatchObject({ ok: false });
    expect(await restoreChange(db, 99_999, joe)).toMatchObject({ ok: false });
  });
});

describe("R2 history is append-only", () => {
  it("the database refuses to edit or delete a history line", async () => {
    const id = await createProduct(db, product("2"));
    await updateProduct(db, id, product("3"));
    const cause = (p: Promise<unknown>) =>
      p.then(
        () => "ok",
        (e: { cause?: Error }) => String(e.cause?.message),
      );
    expect(await cause(db.execute(sql`update edit_log set new_value = '9'`))).toMatch(/append-only/);
    expect(await cause(db.execute(sql`delete from edit_log`))).toMatch(/append-only/);
    expect(await db.select().from(editLog)).toHaveLength(1);
  });
});
