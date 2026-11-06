CREATE TYPE "public"."food_source" AS ENUM('usda', 'off', 'custom');--> statement-breakpoint
CREATE TYPE "public"."meal_type" AS ENUM('breakfast', 'lunch', 'dinner', 'snack');--> statement-breakpoint
CREATE TYPE "public"."nutrient_category" AS ENUM('energy', 'macro', 'lipid', 'vitamin', 'mineral', 'other');--> statement-breakpoint
CREATE TYPE "public"."nutrient_unit" AS ENUM('kcal', 'g', 'mg', 'mcg', 'IU');--> statement-breakpoint
CREATE TYPE "public"."sex_type" AS ENUM('female', 'male');--> statement-breakpoint
CREATE TYPE "public"."supplement_timing" AS ENUM('morning', 'midday', 'evening', 'bedtime', 'with_meal');--> statement-breakpoint
CREATE TYPE "public"."unit_system" AS ENUM('metric', 'imperial');--> statement-breakpoint
CREATE TABLE "diary_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"meal" "meal_type" NOT NULL,
	"food_id" uuid NOT NULL,
	"serving_id" uuid,
	"quantity" double precision NOT NULL,
	"grams" double precision NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diary_entries_quantity_pos" CHECK ("diary_entries"."quantity" > 0),
	CONSTRAINT "diary_entries_grams_nonneg" CHECK ("diary_entries"."grams" >= 0)
);
--> statement-breakpoint
CREATE TABLE "food_nutrients" (
	"food_id" uuid NOT NULL,
	"nutrient_id" integer NOT NULL,
	"amount_per_100g" double precision NOT NULL,
	CONSTRAINT "food_nutrients_food_id_nutrient_id_pk" PRIMARY KEY("food_id","nutrient_id"),
	CONSTRAINT "food_nutrients_amount_nonneg" CHECK ("food_nutrients"."amount_per_100g" >= 0)
);
--> statement-breakpoint
CREATE TABLE "food_servings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"food_id" uuid NOT NULL,
	"label" text NOT NULL,
	"grams" double precision NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	CONSTRAINT "food_servings_grams_pos" CHECK ("food_servings"."grams" > 0)
);
--> statement-breakpoint
CREATE TABLE "foods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"source" "food_source" DEFAULT 'custom' NOT NULL,
	"source_id" text,
	"barcode" text,
	"owner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nutrients" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "nutrients_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" text NOT NULL,
	"name" text NOT NULL,
	"unit" "nutrient_unit" NOT NULL,
	"category" "nutrient_category" NOT NULL,
	"usda_number" text,
	"daily_value" double precision,
	CONSTRAINT "nutrients_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "nutrition_targets" (
	"user_id" uuid NOT NULL,
	"nutrient_id" integer NOT NULL,
	"target" double precision NOT NULL,
	"upper_limit" double precision,
	CONSTRAINT "nutrition_targets_user_id_nutrient_id_pk" PRIMARY KEY("user_id","nutrient_id"),
	CONSTRAINT "nutrition_targets_target_nonneg" CHECK ("nutrition_targets"."target" >= 0)
);
--> statement-breakpoint
CREATE TABLE "supplement_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"servings" double precision DEFAULT 1 NOT NULL,
	"taken_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplement_logs_servings_pos" CHECK ("supplement_logs"."servings" > 0)
);
--> statement-breakpoint
CREATE TABLE "supplement_nutrients" (
	"product_id" uuid NOT NULL,
	"nutrient_id" integer NOT NULL,
	"amount_per_serving" double precision NOT NULL,
	CONSTRAINT "supplement_nutrients_product_id_nutrient_id_pk" PRIMARY KEY("product_id","nutrient_id"),
	CONSTRAINT "supplement_nutrients_amount_nonneg" CHECK ("supplement_nutrients"."amount_per_serving" >= 0)
);
--> statement-breakpoint
CREATE TABLE "supplement_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"name" text NOT NULL,
	"brand" text,
	"barcode" text,
	"serving_label" text DEFAULT '1 serving' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_supplements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"servings_per_dose" double precision DEFAULT 1 NOT NULL,
	"timing" "supplement_timing",
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "user_supplements_servings_pos" CHECK ("user_supplements"."servings_per_dose" > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"unit_system" "unit_system" DEFAULT 'metric' NOT NULL,
	"sex" "sex_type",
	"birth_date" date,
	"height_cm" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_serving_id_food_servings_id_fk" FOREIGN KEY ("serving_id") REFERENCES "public"."food_servings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_nutrients" ADD CONSTRAINT "food_nutrients_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_nutrients" ADD CONSTRAINT "food_nutrients_nutrient_id_nutrients_id_fk" FOREIGN KEY ("nutrient_id") REFERENCES "public"."nutrients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_servings" ADD CONSTRAINT "food_servings_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_targets" ADD CONSTRAINT "nutrition_targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_targets" ADD CONSTRAINT "nutrition_targets_nutrient_id_nutrients_id_fk" FOREIGN KEY ("nutrient_id") REFERENCES "public"."nutrients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplement_logs" ADD CONSTRAINT "supplement_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplement_logs" ADD CONSTRAINT "supplement_logs_product_id_supplement_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."supplement_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplement_nutrients" ADD CONSTRAINT "supplement_nutrients_product_id_supplement_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."supplement_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplement_nutrients" ADD CONSTRAINT "supplement_nutrients_nutrient_id_nutrients_id_fk" FOREIGN KEY ("nutrient_id") REFERENCES "public"."nutrients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplement_products" ADD CONSTRAINT "supplement_products_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_supplements" ADD CONSTRAINT "user_supplements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_supplements" ADD CONSTRAINT "user_supplements_product_id_supplement_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."supplement_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "diary_entries_user_date_idx" ON "diary_entries" USING btree ("user_id","entry_date");--> statement-breakpoint
CREATE INDEX "food_servings_food_idx" ON "food_servings" USING btree ("food_id");--> statement-breakpoint
CREATE UNIQUE INDEX "food_servings_one_default_uq" ON "food_servings" USING btree ("food_id") WHERE "food_servings"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "foods_source_source_id_uq" ON "foods" USING btree ("source","source_id") WHERE "foods"."source_id" is not null;--> statement-breakpoint
CREATE INDEX "foods_barcode_idx" ON "foods" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "foods_owner_idx" ON "foods" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "supplement_logs_user_date_idx" ON "supplement_logs" USING btree ("user_id","entry_date");--> statement-breakpoint
CREATE INDEX "supplement_products_owner_idx" ON "supplement_products" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_supplements_user_product_uq" ON "user_supplements" USING btree ("user_id","product_id");