CREATE SCHEMA "raid";
--> statement-breakpoint
CREATE TABLE "raid"."raids" (
	"raid_id" text PRIMARY KEY NOT NULL,
	"attacker_id" text NOT NULL,
	"defender_id" text NOT NULL,
	"outcome" text NOT NULL,
	"status" text NOT NULL,
	"loot" jsonb,
	"lost_building" text,
	"launched_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raid"."villages" (
	"player_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"levels" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "raids_attacker_idx" ON "raid"."raids" USING btree ("attacker_id");--> statement-breakpoint
CREATE INDEX "raids_defender_idx" ON "raid"."raids" USING btree ("defender_id");