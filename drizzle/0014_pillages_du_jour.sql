CREATE TABLE "ranking"."raids_by_day" (
	"player_id" text NOT NULL,
	"day" text NOT NULL,
	"raids" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "raids_by_day_player_id_day_pk" PRIMARY KEY("player_id","day")
);
