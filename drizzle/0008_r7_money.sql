ALTER TYPE "public"."expense_category" ADD VALUE 'internet';--> statement-breakpoint
ALTER TYPE "public"."expense_category" ADD VALUE 'ads';--> statement-breakpoint
ALTER TYPE "public"."expense_category" ADD VALUE 'rent';--> statement-breakpoint
ALTER TYPE "public"."expense_category" ADD VALUE 'tools';--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "paid_to" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "repeats_monthly" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "sells" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "area" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "map_url" text;--> statement-breakpoint
-- R7: a supplier's old free-text contact becomes the phone when it looks like one (same rules as 0007).
-- Nothing is overwritten: contact stays as it was.
UPDATE "suppliers" s SET "phone" = n.e164
FROM (
  SELECT id,
    CASE
      WHEN btrim(contact) LIKE '+%' AND d ~ '^[0-9]{8,15}$' THEN '+' || d
      WHEN d ~ '^00[0-9]{8,15}$' THEN '+' || substr(d, 3)
      WHEN d ~ '^961[0-9]{7,8}$' THEN '+' || d
      WHEN d ~ '^0?[0-9]{7,8}$' THEN '+961' || regexp_replace(d, '^0', '')
    END AS e164
  FROM (
    SELECT id, contact, regexp_replace(contact, '[^0-9]', '', 'g') AS d
    FROM "suppliers"
    WHERE "contact" IS NOT NULL AND "contact" !~ '[A-Za-z@]'
  ) x
) n
WHERE s.id = n.id AND n.e164 IS NOT NULL AND s.phone IS NULL;
