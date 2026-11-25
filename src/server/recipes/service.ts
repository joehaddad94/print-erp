import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/db/schema";
import { products, recipeItems, recipes } from "@/db/schema";
import { GcodeFormatError, gramsMatch, parseGcodeFile, type ParsedGcode } from "@/lib/gcode";
import { updateLogged } from "@/server/edits/engine";
import { currentSettings } from "@/server/settings/service";
import { isOwnStorageUrl, putFile, readStoredFile, sha256Hex } from "@/server/storage";
import type { ImportInput, OverridesInput } from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

export type Tolerance = { grams: number; pct: number };
export const DEFAULT_TOLERANCE: Tolerance = { grams: 2, pct: 2 };

/** Why an import was refused. `duplicateOf` is set when the same file is already a recipe (R-06). */
export class ImportError extends Error {
  constructor(
    message: string,
    readonly field?: string,
    readonly duplicateOf?: { id: number; name: string; version: number },
  ) {
    super(message);
    this.name = "ImportError";
  }
}

export async function gramsTolerance(db: Db): Promise<Tolerance> {
  const v = (await currentSettings(db)).recipe_grams_tolerance as Partial<Tolerance> | undefined;
  return {
    grams: typeof v?.grams === "number" ? v.grams : DEFAULT_TOLERANCE.grams,
    pct: typeof v?.pct === "number" ? v.pct : DEFAULT_TOLERANCE.pct,
  };
}

/** R-06: an identical file (same SHA-256) already imported as a live recipe version. */
export async function findBySha(db: Db, sha: string) {
  const [r] = await db
    .select({ id: recipes.id, name: recipes.name, version: recipes.version })
    .from(recipes)
    .where(and(eq(recipes.fileSha256, sha), isNull(recipes.deletedAt)))
    .orderBy(desc(recipes.id))
    .limit(1);
  return r ?? null;
}

function fmt(n: number) {
  return Number(n.toFixed(2)).toString();
}

/**
 * D14/D17: the import. The server re-reads the stored file, hashes it, parses it with the same
 * parser the browser used, checks the grams per item, then saves the version and its items in
 * one transaction. A new file for an existing recipe becomes version N+1 and the current one;
 * old versions are never changed (D9, D15).
 */
export async function importRecipe(db: Db, input: ImportInput): Promise<{ id: number; version: number }> {
  if (!isOwnStorageUrl(input.fileUrl)) throw new ImportError("The upload didn't arrive. Choose the file again.");
  const bytes = await readStoredFile(input.fileUrl);
  if (!bytes) throw new ImportError("The upload didn't arrive. Choose the file again.");
  const sha = sha256Hex(bytes);
  const dup = await findBySha(db, sha);
  if (dup) throw new ImportError(`This is the same file as ${dup.name} v${dup.version}.`, undefined, dup);

  let parsed: ParsedGcode;
  try {
    parsed = await parseGcodeFile(new Blob([bytes as Uint8Array<ArrayBuffer>]));
  } catch (e) {
    throw new ImportError(e instanceof GcodeFormatError ? e.message : "This file couldn't be read as G-code.");
  }
  if (parsed.totalGrams == null)
    throw new ImportError("The file has no total grams. Export it again from Creality Print.");

  const tol = await gramsTolerance(db);
  const check = gramsMatch(
    input.items.map((i) => ({ qty: i.qty, gramsPerPiece: i.gramsPerPiece })),
    parsed.totalGrams,
    tol,
  );
  if (!check.ok)
    throw new ImportError(
      `The items add up to ${fmt(check.sum)} g but the file uses ${fmt(parsed.totalGrams)} g ` +
        `(${check.gap > 0 ? "+" : ""}${fmt(check.gap)} g; allowed ±${fmt(check.allowed)} g).`,
      "items",
    );

  const thumb = parsed.thumbnails[0];
  const thumbnailBlobUrl = thumb
    ? await putFile(`thumbnails/${sha.slice(0, 16)}.png`, Buffer.from(thumb.base64Png, "base64"), "image/png")
    : null;

  return db.transaction(async (tx) => {
    let version = 1;
    let recipeGroup: string | undefined;
    if (input.recipeGroup) {
      const versions = await tx
        .select({ id: recipes.id, version: recipes.version })
        .from(recipes)
        .where(eq(recipes.recipeGroup, input.recipeGroup))
        .for("update");
      if (versions.length === 0) throw new ImportError("That recipe no longer exists.");
      version = Math.max(...versions.map((v) => v.version)) + 1;
      recipeGroup = input.recipeGroup;
      await tx
        .update(recipes)
        .set({ isCurrent: false, updatedAt: new Date() })
        .where(and(eq(recipes.recipeGroup, input.recipeGroup), eq(recipes.isCurrent, true)));
    }

    const productIds: number[] = [];
    for (const item of input.items) {
      if (item.productId != null) {
        productIds.push(item.productId);
        continue;
      }
      const [p] = await tx
        .insert(products)
        .values({ name: item.newProductName!, kind: item.newProductKind })
        .returning({ id: products.id });
      productIds.push(p!.id);
    }

    const [r] = await tx
      .insert(recipes)
      .values({
        name: input.name,
        ...(recipeGroup ? { recipeGroup } : {}),
        version,
        isCurrent: true,
        changeNote: input.changeNote,
        fileBlobUrl: input.fileUrl,
        fileName: input.fileName,
        fileSizeBytes: bytes.byteLength,
        fileSha256: sha,
        parser: parsed.parser,
        parserVersion: parsed.parserVersion,
        slicerName: parsed.slicerName,
        slicerVersion: parsed.slicerVersion,
        printerModel: parsed.printerModel,
        nozzleMm: parsed.nozzleMm,
        material: parsed.material,
        layerHeightMm: parsed.layerHeightMm,
        totalGrams: parsed.totalGrams,
        totalMetres: parsed.totalMm == null ? null : parsed.totalMm / 1000,
        estimatedSeconds: parsed.estimatedSeconds,
        nozzleTempC: parsed.nozzleTempC == null ? null : Math.round(parsed.nozzleTempC),
        bedTempC: parsed.bedTempC == null ? null : Math.round(parsed.bedTempC),
        thumbnailBlobUrl,
        rawHeader: parsed.rawHeader,
      })
      .returning({ id: recipes.id, version: recipes.version });

    await tx.insert(recipeItems).values(
      input.items.map((item, i) => ({
        recipeId: r!.id,
        productId: productIds[i]!,
        objectName: item.objectName,
        qtyOnPlate: item.qty,
        gramsPerPiece: item.gramsPerPiece,
      })),
    );
    return { id: r!.id, version: r!.version };
  });
}

/** Current version of every recipe, newest first. */
export async function listRecipes(db: Db) {
  const rows = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.isCurrent, true), isNull(recipes.deletedAt)))
    .orderBy(asc(recipes.name));
  const items = rows.length
    ? await itemsFor(
        db,
        rows.map((r) => r.id),
      )
    : [];
  return rows.map((r) => ({ ...r, items: items.filter((i) => i.recipeId === r.id) }));
}

export async function itemsFor(db: Db, recipeIds: number[]) {
  return db
    .select({
      id: recipeItems.id,
      recipeId: recipeItems.recipeId,
      productId: recipeItems.productId,
      productName: products.name,
      productVariant: products.variant,
      productKind: products.kind,
      objectName: recipeItems.objectName,
      qtyOnPlate: recipeItems.qtyOnPlate,
      gramsPerPiece: recipeItems.gramsPerPiece,
    })
    .from(recipeItems)
    .innerJoin(products, eq(products.id, recipeItems.productId))
    .where(and(inArray(recipeItems.recipeId, recipeIds), isNull(recipeItems.deletedAt)))
    .orderBy(asc(recipeItems.id));
}

export async function getRecipe(db: Db, id: number) {
  const [r] = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, id), isNull(recipes.deletedAt)));
  if (!r) return null;
  const [items, versions] = await Promise.all([
    itemsFor(db, [id]),
    db
      .select({
        id: recipes.id,
        version: recipes.version,
        isCurrent: recipes.isCurrent,
        uploadedAt: recipes.uploadedAt,
        changeNote: recipes.changeNote,
        fileName: recipes.fileName,
      })
      .from(recipes)
      .where(and(eq(recipes.recipeGroup, r.recipeGroup), isNull(recipes.deletedAt)))
      .orderBy(desc(recipes.version)),
  ]);
  return { ...r, items, versions };
}

/** D15: overrides change the current version in place, are logged, and apply to future jobs only. */
export async function updateOverrides(db: Db, id: number, o: OverridesInput, userId?: number) {
  return db.transaction(async (tx) => {
    const [r] = await tx
      .select({ isCurrent: recipes.isCurrent })
      .from(recipes)
      .where(and(eq(recipes.id, id), isNull(recipes.deletedAt)));
    if (!r) throw new ImportError("Recipe not found.");
    if (!r.isCurrent) throw new ImportError("Only the current version can be changed. Older versions are history.");
    return updateLogged(tx, recipes, id, o, { userId });
  });
}

/** Grams one plate uses: the override if set, else the file's total (D15, D23). */
export function plateGrams(r: { gramsOverride: number | null; totalGrams: number | null }) {
  return r.gramsOverride ?? r.totalGrams;
}
