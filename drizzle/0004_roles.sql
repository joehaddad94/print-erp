CREATE TYPE "public"."user_role" AS ENUM('owner', 'staff');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'staff' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- R1: everyone who already has an account set themselves up as an admin, so they become owners.
UPDATE "users" SET "role" = 'owner';
