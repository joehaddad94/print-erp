import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { editLog, products, recipeItems, recipes } from "@/db/schema";
import { seed } from "@/db/seed";
import { createProduct } from "@/server/products/service";
import { productSchema } from "@/server/products/schema";
import { importSchema } from "@/server/recipes/schema";
import { findBySha, getRecipe, ImportError, importRecipe, updateOverrides } from "@/server/recipes/service";
import { putLocal, readStoredFile, sha256Hex } from "@/server/storage";
import { fixtureBlob, haveFixtures } from "../support/fixtures";
import { syntheticGcode, syntheticMovesOnly } from "../support/synthetic-gcode";
import { setupTestDb } from "./helpers";

const { db } = setupTestDb();

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "print-erp-uploads-"));
  process.env.LOCAL_UPLOAD_DIR = dir;
  delete process.env.BLOB_READ_WRITE_TOKEN;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const enc = (s: string) => new TextEncoder().encode(s);
const plate = (grams = 10, ids = ["1", "2"]) =>
  enc(syntheticGcode({ objects: [{ name: "clip.stl", ids }], totalGrams: grams }));

async function upload(bytes: Uint8Array, name = "clip.gcode") {
  return { fileUrl: await putLocal(name, bytes), fileName: name };
}

const input = (o: Record<string, unknown> & { fileUrl: string; fileName: string }) =>
  importSchema.parse({
    name: "Clip",
    recipeGroup: null,
    changeNote: null,
    items: [{ productId: null, newProductName: "Clip", objectName: "clip.stl", qty: 2, gramsPerPiece: 5 }],
    ...o,
  });

describe("R-01/R-02 import stores the file and the version", () => {
  it("saves recipe v1, its item and a new product; hash matches the stored bytes", async () => {
    const bytes = plate();
    const up = await upload(bytes);
    const r = await importRecipe(db, input(up));
    expect(r.version).toBe(1);
    const got = (await getRecipe(db, r.id))!;
    expect(got.fileSha256).toBe(sha256Hex(bytes));
    expect(got.fileSizeBytes).toBe(bytes.byteLength);
    expect(sha256Hex((await readStoredFile(got.fileBlobUrl))!)).toBe(got.fileSha256);
    expect(got.totalGrams).toBe(10);
    expect(got.items).toMatchObject([{ productName: "Clip", qtyOnPlate: 2, gramsPerPiece: 5, objectName: "clip.stl" }]);
    expect(got.thumbnailBlobUrl).toMatch(/^local:/);
    expect(got.rawHeader).toBeTypeOf("object");
  });

  it.skipIf(!haveFixtures)("R-01 croix file: one item × 4 at total ÷ 4", async () => {
    const bytes = new Uint8Array(await fixtureBlob("croix").arrayBuffer());
    const up = await upload(bytes, "new croix.gcode");
    const r = await importRecipe(
      db,
      input({
        ...up,
        name: "Croix",
        items: [
          { productId: null, newProductName: "Croix", objectName: "new croix.stl", qty: 4, gramsPerPiece: 8.47 / 4 },
        ],
      }),
    );
    const got = (await getRecipe(db, r.id))!;
    expect(got.totalGrams).toBeCloseTo(8.47, 2);
    expect(got.items[0]).toMatchObject({ qtyOnPlate: 4 });
    expect(got.printerModel).toMatch(/Ender-3 V3 SE/);
  });
});

describe("R-03 new file into the same recipe", () => {
  it("creates v2, flips is_current, leaves v1 untouched", async () => {
    const v1 = await importRecipe(db, input(await upload(plate(10))));
    const [before] = await db.select().from(recipes).where(eq(recipes.id, v1.id));
    const v2 = await importRecipe(
      db,
      input({
        ...(await upload(plate(12))),
        recipeGroup: before!.recipeGroup,
        changeNote: "thicker walls",
        items: [{ productId: null, newProductName: "Clip", objectName: "clip.stl", qty: 2, gramsPerPiece: 6 }],
      }),
    );
    expect(v2.version).toBe(2);
    const [after] = await db.select().from(recipes).where(eq(recipes.id, v1.id));
    expect(after!.isCurrent).toBe(false);
    expect({ ...after, isCurrent: true, updatedAt: null }).toEqual({ ...before, updatedAt: null });
    const got = (await getRecipe(db, v2.id))!;
    expect(got.isCurrent).toBe(true);
    expect(got.versions.map((v) => v.version)).toEqual([2, 1]);
  });
});

describe("D17 grams check", () => {
  it("R-05 refuses items that don't add up, with the exact gap; nothing saved", async () => {
    const up = await upload(plate(10));
    const bad = input({
      ...up,
      items: [{ productId: null, newProductName: "Clip", objectName: null, qty: 2, gramsPerPiece: 7 }],
    });
    await expect(importRecipe(db, bad)).rejects.toThrow(
      "The items add up to 14 g but the file uses 10 g (+4 g; allowed ±2 g).",
    );
    expect(await db.select().from(recipes)).toHaveLength(0);
    expect(await db.select().from(products)).toHaveLength(0);
  });
  it("accepts within max(2 g, 2%)", async () => {
    const up = await upload(plate(10));
    await expect(
      importRecipe(
        db,
        input({
          ...up,
          items: [{ productId: null, newProductName: "Clip", objectName: null, qty: 2, gramsPerPiece: 5.9 }],
        }),
      ),
    ).resolves.toMatchObject({ version: 1 });
  });
});

describe("R-06 same file twice", () => {
  it("is found by hash and refused with a pointer to the existing recipe", async () => {
    const bytes = plate();
    const first = await importRecipe(db, input(await upload(bytes)));
    expect(await findBySha(db, sha256Hex(bytes))).toMatchObject({ id: first.id, version: 1 });
    const err = await importRecipe(db, input(await upload(bytes, "copy.gcode"))).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImportError);
    expect((err as ImportError).duplicateOf).toMatchObject({ id: first.id });
  });
});

describe("R-04 overrides (D15)", () => {
  it("logs each change, and an old version can't be overridden", async () => {
    await seed(db);
    const v1 = await importRecipe(db, input(await upload(plate(10))));
    const res = await updateOverrides(db, v1.id, {
      gramsOverride: 11,
      wasteAllowancePctOverride: null,
      labourMinutes: 5,
      stepsAndTips: null,
    });
    expect(res.changed.sort()).toEqual(["gramsOverride", "labourMinutes"]);
    const log = await db.select().from(editLog).where(eq(editLog.rowId, v1.id));
    expect(log.map((l) => [l.field, l.newValue])).toEqual(
      expect.arrayContaining([
        ["grams_override", 11],
        ["labour_minutes", 5],
      ]),
    );
    const got = (await getRecipe(db, v1.id))!;
    expect(got.totalGrams).toBe(10); // parsed value never edited
    const [r] = await db.select().from(recipes).where(eq(recipes.id, v1.id));
    await importRecipe(db, input({ ...(await upload(plate(10, ["1", "3"]))), recipeGroup: r!.recipeGroup }));
    await expect(
      updateOverrides(db, v1.id, {
        gramsOverride: 12,
        wasteAllowancePctOverride: null,
        labourMinutes: null,
        stepsAndTips: null,
      }),
    ).rejects.toThrow("Only the current version");
  });
});

describe("D-01 products", () => {
  it("a part with a price is rejected by the form and by the database", async () => {
    expect(productSchema.safeParse({ name: "Hook", kind: "part", salePriceUsd: "3" }).success).toBe(false);
    await expect(db.insert(products).values({ name: "Hook", kind: "part", salePriceUsd: 3 })).rejects.toThrow();
  });
  it("a product without a price is allowed (blocked later from orders)", async () => {
    const id = await createProduct(db, productSchema.parse({ name: "Holder", kind: "product" }));
    const [p] = await db.select().from(products).where(eq(products.id, id));
    expect(p!.salePriceUsd).toBeNull();
  });
  it("import can reuse an existing product", async () => {
    const id = await createProduct(db, productSchema.parse({ name: "Clip", kind: "product", salePriceUsd: "2" }));
    const r = await importRecipe(
      db,
      input({
        ...(await upload(plate())),
        items: [{ productId: id, newProductName: null, objectName: null, qty: 2, gramsPerPiece: 5 }],
      }),
    );
    const items = await db.select().from(recipeItems).where(eq(recipeItems.recipeId, r.id));
    expect(items[0]!.productId).toBe(id);
    expect(await db.select().from(products)).toHaveLength(1);
  });
});

describe("D14 files that don't state grams or time", () => {
  const unknown = (header: string) => enc(syntheticMovesOnly({ header }));
  const one = (gramsPerPiece: number) => [
    { productId: null, newProductName: "Tag", objectName: null, qty: 1, gramsPerPiece },
  ];

  it("saves the app's estimates and says so", async () => {
    const r = await importRecipe(db, input({ ...(await upload(unknown("; a"), "a.gcode")), items: one(0.01) }));
    const got = (await getRecipe(db, r.id))!;
    expect(got.parser).toBe("generic_gcode");
    expect(got.totalGrams).toBeCloseTo(0.01, 2);
    expect(got.estimatedValues.totalGrams).toMatch(/Worked out from/);
    expect(got.estimatedValues.estimatedSeconds).toMatch(/Worked out from the moves/);
  });

  it("Joe's typed values replace the estimates and are recorded as typed", async () => {
    const r = await importRecipe(
      db,
      input({
        ...(await upload(unknown("; b"), "b.gcode")),
        items: one(12),
        confirmed: { totalGrams: 12, estimatedSeconds: 5400 },
      }),
    );
    const got = (await getRecipe(db, r.id))!;
    expect(got).toMatchObject({ totalGrams: 12, estimatedSeconds: 5400 });
    expect(got.estimatedValues.totalGrams).toMatch(/^Typed at import \(the app's estimate was 0\.01 g\)/);
    expect(got.estimatedValues.estimatedSeconds).toMatch(/^Typed at import/);
  });

  it("typed values can't overwrite what the file states", async () => {
    const r = await importRecipe(
      db,
      input({ ...(await upload(plate(10, ["1", "5"]))), confirmed: { totalGrams: 99, estimatedSeconds: 60 } }),
    );
    const got = (await getRecipe(db, r.id))!;
    expect(got).toMatchObject({ totalGrams: 10, estimatedSeconds: 3600, estimatedValues: {} });
  });
});
