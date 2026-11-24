CREATE TYPE "public"."currency" AS ENUM('USD', 'LBP');--> statement-breakpoint
CREATE TYPE "public"."adjustment_type" AS ENUM('weigh_in', 'count');--> statement-breakpoint
CREATE TYPE "public"."product_kind" AS ENUM('product', 'part');--> statement-breakpoint
CREATE TYPE "public"."stock_item_type" AS ENUM('filament', 'consumable', 'finished_product', 'printed_part');--> statement-breakpoint
CREATE TYPE "public"."stock_unit" AS ENUM('grams', 'pieces');--> statement-breakpoint
CREATE TYPE "public"."movement_reason" AS ENUM('print', 'assembly_in', 'assembly_out', 'sale', 'purchase', 'weigh_in', 'count', 'waste');--> statement-breakpoint
CREATE TYPE "public"."machine_status" AS ENUM('active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."machine_type" AS ENUM('printer', 'equipment');--> statement-breakpoint
CREATE TYPE "public"."failure_method" AS ENUM('allowance', 'actual');--> statement-breakpoint
CREATE TYPE "public"."grams_source" AS ENUM('recipe_estimate', 'override', 'weighed');--> statement-breakpoint
CREATE TYPE "public"."hours_source" AS ENUM('gcode_estimate', 'confirmed', 'entered');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('filament', 'packaging', 'machine', 'electricity', 'delivery', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'whish', 'omt', 'bank_transfer', 'card', 'courier_cod', 'other');--> statement-breakpoint
CREATE TYPE "public"."order_channel" AS ENUM('whatsapp', 'instagram', 'in_person', 'other');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('quoted', 'confirmed', 'printing', 'ready', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."edit_action" AS ENUM('edit', 'delete');--> statement-breakpoint
CREATE TABLE "adjustments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "adjustments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"notes" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"type" "adjustment_type" NOT NULL,
	"stock_item_id" integer NOT NULL,
	"expected" numeric(14, 4) NOT NULL,
	"measured" numeric(14, 4) NOT NULL,
	"spools_weighed" integer,
	"difference" numeric(14, 4) NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "assemblies" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "assemblies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"notes" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"product_id" integer NOT NULL,
	"qty_made" integer NOT NULL,
	"assembled_on" date DEFAULT now() NOT NULL,
	"unit_cost_usd" numeric(16, 8),
	"assembly_minutes_per_unit" numeric(14, 4),
	CONSTRAINT "assemblies_qty_positive" CHECK ("assemblies"."qty_made" > 0)
);
--> statement-breakpoint
CREATE TABLE "product_parts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_parts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"notes" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"product_id" integer NOT NULL,
	"part_id" integer NOT NULL,
	"qty_per_product" numeric(14, 4) NOT NULL,
	CONSTRAINT "product_parts_qty_positive" CHECK ("product_parts"."qty_per_product" > 0),
	CONSTRAINT "product_parts_not_self" CHECK ("product_parts"."product_id" <> "product_parts"."part_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "products_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"notes" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"name" text NOT NULL,
	"variant" text,
	"kind" "product_kind" DEFAULT 'product' NOT NULL,
	"file_name" text,
	"file_version" text,
	"sale_price_usd" numeric(16, 8),
	"packaging_item_id" integer,
	CONSTRAINT "products_part_not_sold" CHECK ("products"."kind" = 'product' or ("products"."sale_price_usd" is null and "products"."packaging_item_id" is null)),
	CONSTRAINT "products_price_not_negative" CHECK ("products"."sale_price_usd" is null or "products"."sale_price_usd" >= 0)
);
--> statement-breakpoint
CREATE TABLE "recipe_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "recipe_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"notes" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recipe_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"object_name" text,
	"qty_on_plate" integer NOT NULL,
	"grams_per_piece" numeric(14, 4) NOT NULL,
	CONSTRAINT "recipe_items_qty_positive" CHECK ("recipe_items"."qty_on_plate" > 0),
	CONSTRAINT "recipe_items_grams_positive" CHECK ("recipe_items"."grams_per_piece" > 0)
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "recipes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"notes" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"name" text NOT NULL,
	"recipe_group" uuid DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"change_note" text,
	"file_blob_url" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"file_sha256" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"parser" text NOT NULL,
	"parser_version" text NOT NULL,
	"slicer_name" text,
	"slicer_version" text,
	"printer_model" text,
	"nozzle_mm" numeric(14, 4),
	"material" text,
	"layer_height_mm" numeric(14, 4),
	"total_grams" numeric(14, 4),
	"total_metres" numeric(14, 4),
	"estimated_seconds" numeric(14, 4),
	"nozzle_temp_c" integer,
	"bed_temp_c" integer,
	"thumbnail_blob_url" text,
	"raw_header" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"grams_override" numeric(14, 4),
	"waste_allowance_pct_override" numeric(14, 4),
	"labour_minutes" numeric(14, 4),
	"steps_and_tips" text,
	CONSTRAINT "recipes_sha256_format" CHECK ("recipes"."file_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "recipes_overrides_valid" CHECK (("recipes"."grams_override" is null or "recipes"."grams_override" > 0) and ("recipes"."waste_allowance_pct_override" is null or ("recipes"."waste_allowance_pct_override" >= 0 and "recipes"."waste_allowance_pct_override" < 100)) and ("recipes"."labour_minutes" is null or "recipes"."labour_minutes" >= 0))
);
--> statement-breakpoint
CREATE TABLE "stock_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"notes" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"name" text NOT NULL,
	"type" "stock_item_type" NOT NULL,
	"unit" "stock_unit" NOT NULL,
	"product_id" integer,
	"material" text,
	"color" text,
	"empty_spool_weight_g" numeric(14, 4),
	"reorder_level" numeric(14, 4),
	CONSTRAINT "stock_items_unit_matches_type" CHECK (("stock_items"."type" = 'filament' and "stock_items"."unit" = 'grams') or ("stock_items"."type" in ('finished_product','printed_part') and "stock_items"."unit" = 'pieces') or "stock_items"."type" = 'consumable'),
	CONSTRAINT "stock_items_product_link" CHECK (("stock_items"."type" in ('finished_product','printed_part')) = ("stock_items"."product_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_movements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"notes" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stock_item_id" integer NOT NULL,
	"amount" numeric(14, 4) NOT NULL,
	"reason" "movement_reason" NOT NULL,
	"moved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"print_job_id" integer,
	"print_job_item_id" integer,
	"print_job_filament_id" integer,
	"assembly_id" integer,
	"order_item_id" integer,
	"adjustment_id" integer,
	"expense_id" integer,
	"unit_cost_usd" numeric(16, 8),
	"labour_minutes_per_unit" numeric(14, 4),
	"avg_unit_cost_after_usd" numeric(16, 8),
	CONSTRAINT "stock_movements_amount_not_zero" CHECK ("stock_movements"."amount" <> 0),
	CONSTRAINT "stock_movements_in_has_cost" CHECK ("stock_movements"."amount" < 0 or "stock_movements"."reason" in ('weigh_in','count') or "stock_movements"."unit_cost_usd" is not null)
);
--> statement-breakpoint
CREATE TABLE "machines" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "machines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"notes" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"name" text NOT NULL,
	"type" "machine_type" NOT NULL,
	"model" text,
	"bought_on" date,
	"purchase_amount" numeric(16, 4),
	"purchase_currency" "currency" DEFAULT 'USD' NOT NULL,
	"purchase_rate_to_usd" numeric(24, 14) DEFAULT 1 NOT NULL,
	"expected_life_hours" numeric(14, 4),
	"avg_power_kw" numeric(14, 4),
	"nozzle_mm" numeric(14, 4),
	"bed_x_mm" integer,
	"bed_y_mm" integer,
	"status" "machine_status" DEFAULT 'active' NOT NULL,
	CONSTRAINT "machines_rate_positive" CHECK ("machines"."purchase_rate_to_usd" > 0),
	CONSTRAINT "machines_life_positive" CHECK ("machines"."expected_life_hours" is null or "machines"."expected_life_hours" > 0),
	CONSTRAINT "machines_power_positive" CHECK ("machines"."avg_power_kw" is null or "machines"."avg_power_kw" > 0)
);
--> statement-breakpoint
CREATE TABLE "print_job_filaments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "print_job_filaments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"notes" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"print_job_id" integer NOT NULL,
	"filament_id" integer NOT NULL,
	"grams_used" numeric(14, 4) NOT NULL,
	"grams_source" "grams_source" NOT NULL,
	"weighed_grams" numeric(14, 4),
	"cost_per_gram_usd" numeric(16, 8),
	CONSTRAINT "print_job_filaments_grams_positive" CHECK ("print_job_filaments"."grams_used" >= 0)
);
--> statement-breakpoint
CREATE TABLE "print_job_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "print_job_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"notes" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"print_job_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"qty_planned" integer NOT NULL,
	"qty_good" integer,
	"qty_failed" integer GENERATED ALWAYS AS (qty_planned - qty_good) STORED,
	"grams_per_piece" numeric(14, 4) NOT NULL,
	"grams_share" numeric(14, 4),
	"cost_share_usd" numeric(16, 8),
	"unit_cost_usd" numeric(16, 8),
	"waste_cost_usd" numeric(16, 8),
	"labour_minutes_per_unit" numeric(14, 4),
	CONSTRAINT "print_job_items_planned_positive" CHECK ("print_job_items"."qty_planned" > 0),
	CONSTRAINT "print_job_items_good_range" CHECK ("print_job_items"."qty_good" is null or ("print_job_items"."qty_good" >= 0 and "print_job_items"."qty_good" <= "print_job_items"."qty_planned"))
);
--> statement-breakpoint
CREATE TABLE "print_jobs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "print_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"notes" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recipe_id" integer NOT NULL,
	"machine_id" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"failure_reason" text,
	"power_cut" boolean DEFAULT false NOT NULL,
	"hours" numeric(14, 4),
	"hours_source" "hours_source",
	"stopped_at_pct" numeric(14, 4) DEFAULT 100 NOT NULL,
	"estimated_seconds" numeric(14, 4),
	"electricity_kwh_price_usd" numeric(16, 8),
	"printer_power_kw" numeric(14, 4),
	"machine_cost_per_hour_usd" numeric(16, 8),
	"failure_method" "failure_method",
	"failure_allowance_pct" numeric(14, 4),
	"recipe_overrides" jsonb,
	"rate_to_usd" numeric(24, 14) DEFAULT 1 NOT NULL,
	"job_cost_usd" numeric(16, 8),
	"waste_cost_usd" numeric(16, 8),
	CONSTRAINT "print_jobs_stopped_pct_range" CHECK ("print_jobs"."stopped_at_pct" > 0 and "print_jobs"."stopped_at_pct" <= 100),
	CONSTRAINT "print_jobs_hours_positive" CHECK ("print_jobs"."hours" is null or "print_jobs"."hours" > 0),
	CONSTRAINT "print_jobs_finished_has_hours" CHECK ("print_jobs"."finished_at" is null or ("print_jobs"."hours" is not null and "print_jobs"."hours_source" is not null))
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "expenses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"notes" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"spent_on" date DEFAULT now() NOT NULL,
	"category" "expense_category" NOT NULL,
	"amount" numeric(16, 4) NOT NULL,
	"currency" "currency" DEFAULT 'USD' NOT NULL,
	"rate_to_usd" numeric(24, 14) DEFAULT 1 NOT NULL,
	"payment_method" "payment_method",
	"description" text,
	"supplier_id" integer,
	"stock_item_id" integer,
	"machine_id" integer,
	CONSTRAINT "expenses_rate_positive" CHECK ("expenses"."rate_to_usd" > 0),
	CONSTRAINT "expenses_usd_rate_is_one" CHECK ("expenses"."currency" <> 'USD' or "expenses"."rate_to_usd" = 1)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "suppliers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"notes" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"name" text NOT NULL,
	"contact" text
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "customers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"notes" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"handle" text
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"notes" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"order_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"customization" text,
	"unit_price" numeric(16, 4) NOT NULL,
	"qty_reserved" integer DEFAULT 0 NOT NULL,
	"packaging_cost_per_unit_usd" numeric(16, 8),
	"unit_cost_usd" numeric(16, 8),
	"labour_minutes_per_unit" numeric(14, 4),
	CONSTRAINT "order_items_qty_positive" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_price_not_negative" CHECK ("order_items"."unit_price" >= 0),
	CONSTRAINT "order_items_reserved_range" CHECK ("order_items"."qty_reserved" >= 0 and "order_items"."qty_reserved" <= "order_items"."quantity")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "orders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"notes" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"channel" "order_channel" DEFAULT 'whatsapp' NOT NULL,
	"customer_id" integer,
	"status" "order_status" DEFAULT 'confirmed' NOT NULL,
	"due_on" date,
	"delivered_at" timestamp with time zone,
	"currency" "currency" DEFAULT 'USD' NOT NULL,
	"rate_to_usd" numeric(24, 14) DEFAULT 1 NOT NULL,
	"delivered_by" text,
	"delivery_charge" numeric(16, 4),
	CONSTRAINT "orders_rate_positive" CHECK ("orders"."rate_to_usd" > 0),
	CONSTRAINT "orders_delivered_has_time" CHECK ("orders"."status" <> 'delivered' or "orders"."delivered_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"notes" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"order_id" integer NOT NULL,
	"paid_on" date DEFAULT now() NOT NULL,
	"amount" numeric(16, 4) NOT NULL,
	"currency" "currency" DEFAULT 'USD' NOT NULL,
	"rate_to_usd" numeric(24, 14) DEFAULT 1 NOT NULL,
	"method" "payment_method" DEFAULT 'cash' NOT NULL,
	"collected_by" text,
	"received_at" timestamp with time zone,
	"reference" text,
	CONSTRAINT "payments_rate_positive" CHECK ("payments"."rate_to_usd" > 0),
	CONSTRAINT "payments_not_zero" CHECK ("payments"."amount" <> 0)
);
--> statement-breakpoint
CREATE TABLE "edit_log" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "edit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"notes" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"table_name" text NOT NULL,
	"row_id" integer NOT NULL,
	"field" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text,
	"action" "edit_action" DEFAULT 'edit' NOT NULL,
	"edited_by" integer
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"notes" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"notes" text,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"last_login_at" timestamp with time zone,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"last_failed_login_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assemblies" ADD CONSTRAINT "assemblies_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_parts" ADD CONSTRAINT "product_parts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_parts" ADD CONSTRAINT "product_parts_part_id_products_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_packaging_item_id_stock_items_id_fk" FOREIGN KEY ("packaging_item_id") REFERENCES "public"."stock_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_print_job_id_print_jobs_id_fk" FOREIGN KEY ("print_job_id") REFERENCES "public"."print_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_print_job_item_id_print_job_items_id_fk" FOREIGN KEY ("print_job_item_id") REFERENCES "public"."print_job_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_print_job_filament_id_print_job_filaments_id_fk" FOREIGN KEY ("print_job_filament_id") REFERENCES "public"."print_job_filaments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_assembly_id_assemblies_id_fk" FOREIGN KEY ("assembly_id") REFERENCES "public"."assemblies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_adjustment_id_adjustments_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."adjustments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_job_filaments" ADD CONSTRAINT "print_job_filaments_print_job_id_print_jobs_id_fk" FOREIGN KEY ("print_job_id") REFERENCES "public"."print_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_job_filaments" ADD CONSTRAINT "print_job_filaments_filament_id_stock_items_id_fk" FOREIGN KEY ("filament_id") REFERENCES "public"."stock_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_job_items" ADD CONSTRAINT "print_job_items_print_job_id_print_jobs_id_fk" FOREIGN KEY ("print_job_id") REFERENCES "public"."print_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_job_items" ADD CONSTRAINT "print_job_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_log" ADD CONSTRAINT "edit_log_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_parts_uq" ON "product_parts" USING btree ("product_id","part_id") WHERE "product_parts"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "recipes_group_version_uq" ON "recipes" USING btree ("recipe_group","version");--> statement-breakpoint
CREATE UNIQUE INDEX "recipes_one_current_uq" ON "recipes" USING btree ("recipe_group") WHERE "recipes"."is_current" and "recipes"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "recipes_sha256_idx" ON "recipes" USING btree ("file_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_items_product_uq" ON "stock_items" USING btree ("product_id") WHERE "stock_items"."product_id" is not null and "stock_items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "stock_movements_item_time_idx" ON "stock_movements" USING btree ("stock_item_id","moved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "print_jobs_one_running_per_machine_uq" ON "print_jobs" USING btree ("machine_id") WHERE "print_jobs"."finished_at" is null and "print_jobs"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "print_jobs_recipe_idx" ON "print_jobs" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "edit_log_row_idx" ON "edit_log" USING btree ("table_name","row_id");--> statement-breakpoint
CREATE INDEX "edit_log_edited_at_idx" ON "edit_log" USING btree ("edited_at");--> statement-breakpoint
CREATE UNIQUE INDEX "settings_key_valid_from_uq" ON "settings" USING btree ("key","valid_from");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_uq" ON "users" USING btree (lower("username"));--> statement-breakpoint
CREATE VIEW "public"."order_balance" AS (
  with lines as (
    select o.id as order_id,
           coalesce(sum(oi.quantity * oi.unit_price) filter (where oi.deleted_at is null), 0) * o.rate_to_usd as total_usd
    from orders o
    left join order_items oi on oi.order_id = o.id
    where o.deleted_at is null
    group by o.id, o.rate_to_usd
  ), pays as (
    select p.order_id,
           coalesce(sum(p.amount * p.rate_to_usd) filter (where p.received_at is not null or p.method <> 'courier_cod'), 0) as received_usd,
           coalesce(sum(p.amount * p.rate_to_usd) filter (where p.received_at is null and p.method = 'courier_cod'), 0) as held_usd
    from payments p
    where p.deleted_at is null
    group by p.order_id
  )
  select l.order_id,
         l.total_usd,
         coalesce(p.received_usd, 0) as received_usd,
         coalesce(p.held_usd, 0) as held_by_courier_usd,
         l.total_usd - coalesce(p.received_usd, 0) - coalesce(p.held_usd, 0) as balance_due_usd,
         case
           when coalesce(p.received_usd, 0) + coalesce(p.held_usd, 0) <= 0 and l.total_usd > 0 then 'unpaid'
           when l.total_usd - coalesce(p.received_usd, 0) - coalesce(p.held_usd, 0) > 0.005 then 'partly_paid'
           else 'paid'
         end as payment_state
  from lines l
  left join pays p on p.order_id = l.order_id
);--> statement-breakpoint
CREATE VIEW "public"."order_shortfall" AS (
  select oi.id as order_item_id, oi.order_id, oi.product_id, oi.quantity, oi.qty_reserved,
         oi.quantity - oi.qty_reserved as need_to_print
  from order_items oi
  join orders o on o.id = oi.order_id
  where oi.deleted_at is null and o.deleted_at is null
    and o.status not in ('delivered', 'cancelled')
    and oi.quantity > oi.qty_reserved
);--> statement-breakpoint
CREATE VIEW "public"."stock_available" AS (
  select si.id as stock_item_id,
         coalesce(m.on_hand, 0) as on_hand,
         coalesce(r.reserved, 0) as reserved,
         coalesce(m.on_hand, 0) - coalesce(r.reserved, 0) as available
  from stock_items si
  left join (
    select stock_item_id, sum(amount) as on_hand
    from stock_movements
    where deleted_at is null
    group by stock_item_id
  ) m on m.stock_item_id = si.id
  left join (
    select oi.product_id, sum(oi.qty_reserved) as reserved
    from order_items oi
    join orders o on o.id = oi.order_id
    where oi.deleted_at is null and o.deleted_at is null
      and o.status not in ('delivered', 'cancelled')
    group by oi.product_id
  ) r on r.product_id = si.product_id
  where si.deleted_at is null
);--> statement-breakpoint
CREATE VIEW "public"."stock_on_hand" AS (
  select si.id as stock_item_id,
         coalesce(sum(m.amount) filter (where m.deleted_at is null), 0) as on_hand
  from stock_items si
  left join stock_movements m on m.stock_item_id = si.id
  where si.deleted_at is null
  group by si.id
);