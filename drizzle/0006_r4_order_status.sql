-- R4: "printing" and "ready" are no longer set by hand. Ready is worked out from reservations.
-- Rows that change are copied first so nothing is lost.
CREATE TABLE IF NOT EXISTS "_before_r4_orders" AS SELECT * FROM "orders" WHERE "status" IN ('printing', 'ready');
--> statement-breakpoint
UPDATE "orders" SET "status" = 'confirmed' WHERE "status" IN ('printing', 'ready');
--> statement-breakpoint
-- Same lockdown as every table (0001): not reachable through Supabase's Data API.
ALTER TABLE "_before_r4_orders" ENABLE ROW LEVEL SECURITY;
