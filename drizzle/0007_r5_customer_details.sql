ALTER TABLE "customers" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "area" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "map_url" text;--> statement-breakpoint
-- R5: phones become E.164 (+96170123456). Rows that change are copied first; anything that
-- doesn't look like a phone number is left as typed.
CREATE TABLE IF NOT EXISTS "_before_r5_customers" AS SELECT * FROM "customers" WHERE "phone" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "_before_r5_customers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
UPDATE "customers" c SET "phone" = n.e164
FROM (
  SELECT id,
    CASE
      WHEN btrim(phone) LIKE '+%' AND d ~ '^[0-9]{8,15}$' THEN '+' || d
      WHEN d ~ '^00[0-9]{8,15}$' THEN '+' || substr(d, 3)
      WHEN d ~ '^961[0-9]{7,8}$' THEN '+' || d
      WHEN d ~ '^0?[0-9]{7,8}$' THEN '+961' || regexp_replace(d, '^0', '')
    END AS e164
  FROM (SELECT id, phone, regexp_replace(phone, '[^0-9]', '', 'g') AS d FROM "customers" WHERE "phone" IS NOT NULL) x
) n
WHERE c.id = n.id AND n.e164 IS NOT NULL AND n.e164 <> c.phone;
