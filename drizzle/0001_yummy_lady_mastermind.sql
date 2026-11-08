CREATE TABLE "diary_days" (
	"user_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diary_days_user_id_entry_date_pk" PRIMARY KEY("user_id","entry_date")
);
--> statement-breakpoint
CREATE TABLE "exercise_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"name" text NOT NULL,
	"duration_min" double precision,
	"calories_burned" double precision NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_entries_calories_nonneg" CHECK ("exercise_entries"."calories_burned" >= 0),
	CONSTRAINT "exercise_entries_duration_pos" CHECK ("exercise_entries"."duration_min" is null or "exercise_entries"."duration_min" > 0)
);
--> statement-breakpoint
ALTER TABLE "diary_days" ADD CONSTRAINT "diary_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_entries" ADD CONSTRAINT "exercise_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercise_entries_user_date_idx" ON "exercise_entries" USING btree ("user_id","entry_date");