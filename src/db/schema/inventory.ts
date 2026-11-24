import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { baseColumns, qty, usd } from "./_common";

export const productKindEnum = pgEnum("product_kind", ["product", "part"]);
export const stockItemTypeEnum = pgEnum("stock_item_type", ["filament", "consumable", "finished_product", "printed_part"]);
export const stockUnitEnum = pgEnum("stock_unit", ["grams", "pieces"]);
export const adjustmentTypeEnum = pgEnum("adjustment_type", ["weigh_in", "count"]);

/** What you sell (kind=product) and what you assemble it from (kind=part). D19, D25, D31. */
export const products = pgTable(
  "products",
  {
    ...baseColumns(),
    name: text("name").notNull(),
    variant: text("variant"),
    kind: productKindEnum("kind").notNull().default("product"),
    fileName: text("file_name"),
    fileVersion: text("file_version"),
    /** Set by Joe, never derived from cost; empty = cannot be sold (D31). USD (D43). */
    salePriceUsd: usd("sale_price_usd"),
    packagingItemId: integer("packaging_item_id").references((): AnyPgColumn => stockItems.id),
  },
  (t) => [
    check("products_part_not_sold", sql`${t.kind} = 'product' or (${t.salePriceUsd} is null and ${t.packagingItemId} is null)`),
    check("products_price_not_negative", sql`${t.salePriceUsd} is null or ${t.salePriceUsd} >= 0`),
  ],
);

/** Parts list (BOM), D19. */
export const productParts = pgTable(
  "product_parts",
  {
    ...baseColumns(),
    productId: integer("product_id").notNull().references(() => products.id),
    partId: integer("part_id").notNull().references(() => products.id),
    qtyPerProduct: qty("qty_per_product").notNull(),
  },
  (t) => [
    uniqueIndex("product_parts_uq").on(t.productId, t.partId).where(sql`${t.deletedAt} is null`),
    check("product_parts_qty_positive", sql`${t.qtyPerProduct} > 0`),
    check("product_parts_not_self", sql`${t.productId} <> ${t.partId}`),
  ],
);

/** Everything on the shelf. A filament row is one material + colour (D23). */
export const stockItems = pgTable(
  "stock_items",
  {
    ...baseColumns(),
    name: text("name").notNull(),
    type: stockItemTypeEnum("type").notNull(),
    unit: stockUnitEnum("unit").notNull(),
    productId: integer("product_id").references((): AnyPgColumn => products.id),
    material: text("material"),
    color: text("color"),
    emptySpoolWeightG: qty("empty_spool_weight_g"),
    reorderLevel: qty("reorder_level"),
  },
  (t) => [
    uniqueIndex("stock_items_product_uq").on(t.productId).where(sql`${t.productId} is not null and ${t.deletedAt} is null`),
    check(
      "stock_items_unit_matches_type",
      sql`(${t.type} = 'filament' and ${t.unit} = 'grams') or (${t.type} in ('finished_product','printed_part') and ${t.unit} = 'pieces') or ${t.type} = 'consumable'`,
    ),
    check(
      "stock_items_product_link",
      sql`(${t.type} in ('finished_product','printed_part')) = (${t.productId} is not null)`,
    ),
  ],
);

/** One row per imported .gcode file (D14). A new file = a new version in the same recipe_group. */
export const recipes = pgTable(
  "recipes",
  {
    ...baseColumns(),
    name: text("name").notNull(),
    recipeGroup: uuid("recipe_group").notNull().defaultRandom(),
    version: integer("version").notNull().default(1),
    isCurrent: boolean("is_current").notNull().default(true),
    changeNote: text("change_note"),
    // Original file (rule 7)
    fileBlobUrl: text("file_blob_url").notNull(),
    fileName: text("file_name").notNull(),
    fileSizeBytes: integer("file_size_bytes").notNull(),
    fileSha256: text("file_sha256").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    parser: text("parser").notNull(),
    parserVersion: text("parser_version").notNull(),
    // Parsed fields: never edited
    slicerName: text("slicer_name"),
    slicerVersion: text("slicer_version"),
    printerModel: text("printer_model"),
    nozzleMm: qty("nozzle_mm"),
    material: text("material"),
    layerHeightMm: qty("layer_height_mm"),
    totalGrams: qty("total_grams"),
    totalMetres: qty("total_metres"),
    estimatedSeconds: qty("estimated_seconds"),
    nozzleTempC: integer("nozzle_temp_c"),
    bedTempC: integer("bed_temp_c"),
    thumbnailBlobUrl: text("thumbnail_blob_url"),
    rawHeader: jsonb("raw_header").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    // Overrides (D15): edited in place, logged, future jobs only
    gramsOverride: qty("grams_override"),
    wasteAllowancePctOverride: qty("waste_allowance_pct_override"),
    labourMinutes: qty("labour_minutes"),
    stepsAndTips: text("steps_and_tips"),
  },
  (t) => [
    uniqueIndex("recipes_group_version_uq").on(t.recipeGroup, t.version),
    uniqueIndex("recipes_one_current_uq").on(t.recipeGroup).where(sql`${t.isCurrent} and ${t.deletedAt} is null`),
    index("recipes_sha256_idx").on(t.fileSha256),
    check("recipes_sha256_format", sql`${t.fileSha256} ~ '^[0-9a-f]{64}$'`),
    check("recipes_overrides_valid", sql`(${t.gramsOverride} is null or ${t.gramsOverride} > 0) and (${t.wasteAllowancePctOverride} is null or (${t.wasteAllowancePctOverride} >= 0 and ${t.wasteAllowancePctOverride} < 100)) and (${t.labourMinutes} is null or ${t.labourMinutes} >= 0)`),
  ],
);

/** What one plate prints (D17). */
export const recipeItems = pgTable(
  "recipe_items",
  {
    ...baseColumns(),
    recipeId: integer("recipe_id").notNull().references(() => recipes.id),
    productId: integer("product_id").notNull().references(() => products.id),
    /** Object name from the file, kept so the importer can match it on re-import. */
    objectName: text("object_name"),
    qtyOnPlate: integer("qty_on_plate").notNull(),
    gramsPerPiece: qty("grams_per_piece").notNull(),
  },
  (t) => [
    check("recipe_items_qty_positive", sql`${t.qtyOnPlate} > 0`),
    check("recipe_items_grams_positive", sql`${t.gramsPerPiece} > 0`),
  ],
);

/** Assemble screen (D19, D24, D36). */
export const assemblies = pgTable(
  "assemblies",
  {
    ...baseColumns(),
    productId: integer("product_id").notNull().references(() => products.id),
    qtyMade: integer("qty_made").notNull(),
    assembledOn: date("assembled_on").notNull().defaultNow(),
    unitCostUsd: usd("unit_cost_usd"),
    assemblyMinutesPerUnit: qty("assembly_minutes_per_unit"),
  },
  (t) => [check("assemblies_qty_positive", sql`${t.qtyMade} > 0`)],
);

/** Weigh-ins and shelf counts only; mistakes are edits (D13). */
export const adjustments = pgTable("adjustments", {
  ...baseColumns(),
  type: adjustmentTypeEnum("type").notNull(),
  stockItemId: integer("stock_item_id").notNull().references(() => stockItems.id),
  expected: qty("expected").notNull(),
  measured: qty("measured").notNull(),
  spoolsWeighed: integer("spools_weighed"),
  difference: qty("difference").notNull(),
  reason: text("reason"),
});
