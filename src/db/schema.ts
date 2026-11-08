import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { NUTRIENT_CATEGORIES, NUTRIENT_UNITS } from "./nutrient-catalog";

/*
 * Conventions
 * - Food nutrient amounts are stored per 100 g; supplement nutrient amounts per
 *   serving (1 capsule, 1 scoop...). Nutrients are referenced by `nutrients.id`.
 * - `entry_date` is the user's *local* calendar day (a plain `date`), so a
 *   late-night snack never lands on the wrong day when timezones differ.
 * - Diary rows keep a resolved `grams` value so history stays stable even if a
 *   food's serving definitions are edited or deleted later.
 */

export const nutrientUnit = pgEnum("nutrient_unit", NUTRIENT_UNITS);
export const nutrientCategory = pgEnum("nutrient_category", NUTRIENT_CATEGORIES);
export const foodSource = pgEnum("food_source", ["usda", "off", "custom"]);
export const mealType = pgEnum("meal_type", ["breakfast", "lunch", "dinner", "snack"]);
export const unitSystem = pgEnum("unit_system", ["metric", "imperial"]);
export const sexType = pgEnum("sex_type", ["female", "male"]);
export const supplementTiming = pgEnum("supplement_timing", [
  "morning",
  "midday",
  "evening",
  "bedtime",
  "with_meal",
]);

/** App users. The auth provider is undecided (see docs/DECISIONS.md). */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  timezone: text("timezone").notNull().default("UTC"),
  unitSystem: unitSystem("unit_system").notNull().default("metric"),
  /** Used later to pick age/sex-specific reference intakes. */
  sex: sexType("sex"),
  birthDate: date("birth_date", { mode: "string" }),
  heightCm: doublePrecision("height_cm"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Catalogue of trackable nutrients (seeded from nutrient-catalog.ts). */
export const nutrients = pgTable("nutrients", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  unit: nutrientUnit("unit").notNull(),
  category: nutrientCategory("category").notNull(),
  usdaNumber: text("usda_number"),
  /** FDA adult Daily Value: a generic default target. */
  dailyValue: doublePrecision("daily_value"),
});

/** Foods. `ownerId` is null for shared/imported foods, set for a user's custom foods. */
export const foods = pgTable(
  "foods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    brand: text("brand"),
    source: foodSource("source").notNull().default("custom"),
    /** USDA FDC id or Open Food Facts code, for de-duplicated imports. */
    sourceId: text("source_id"),
    /** Which release of the source a food came from ("foundation", "sr_legacy"), so duplicates can be told apart. */
    dataset: text("dataset"),
    barcode: text("barcode"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("foods_source_source_id_uq")
      .on(t.source, t.sourceId)
      .where(sql`${t.sourceId} is not null`),
    index("foods_barcode_idx").on(t.barcode),
    index("foods_owner_idx").on(t.ownerId),
  ],
);

/** Nutrient content of a food, per 100 g. */
export const foodNutrients = pgTable(
  "food_nutrients",
  {
    foodId: uuid("food_id")
      .notNull()
      .references(() => foods.id, { onDelete: "cascade" }),
    nutrientId: integer("nutrient_id")
      .notNull()
      .references(() => nutrients.id),
    amountPer100g: doublePrecision("amount_per_100g").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.foodId, t.nutrientId] }),
    check("food_nutrients_amount_nonneg", sql`${t.amountPer100g} >= 0`),
  ],
);

/** Named portions of a food ("1 cup", "1 medium") and their weight in grams. */
export const foodServings = pgTable(
  "food_servings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    foodId: uuid("food_id")
      .notNull()
      .references(() => foods.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    grams: doublePrecision("grams").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
  },
  (t) => [
    check("food_servings_grams_pos", sql`${t.grams} > 0`),
    index("food_servings_food_idx").on(t.foodId),
    // At most one default serving per food.
    uniqueIndex("food_servings_one_default_uq")
      .on(t.foodId)
      .where(sql`${t.isDefault}`),
  ],
);

/** A user's daily goal for one nutrient, with an optional upper limit. */
export const nutritionTargets = pgTable(
  "nutrition_targets",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    nutrientId: integer("nutrient_id")
      .notNull()
      .references(() => nutrients.id),
    target: doublePrecision("target").notNull(),
    upperLimit: doublePrecision("upper_limit"),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.nutrientId] }),
    check("nutrition_targets_target_nonneg", sql`${t.target} >= 0`),
  ],
);

/** One logged food: the food diary. */
export const diaryEntries = pgTable(
  "diary_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entryDate: date("entry_date", { mode: "string" }).notNull(),
    meal: mealType("meal").notNull(),
    foodId: uuid("food_id")
      .notNull()
      .references(() => foods.id),
    servingId: uuid("serving_id").references(() => foodServings.id, { onDelete: "set null" }),
    /** Number of servings (or grams when servingId is null). */
    quantity: doublePrecision("quantity").notNull(),
    /** Resolved weight in grams, used for all nutrient maths. */
    grams: doublePrecision("grams").notNull(),
    loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("diary_entries_user_date_idx").on(t.userId, t.entryDate),
    check("diary_entries_quantity_pos", sql`${t.quantity} > 0`),
    check("diary_entries_grams_nonneg", sql`${t.grams} >= 0`),
  ],
);

/**
 * A diary day the user has marked complete ("I'm done logging today"). A row
 * exists only for completed days; removing the row re-opens the day. Completing
 * a day is a signal for the summary and, later, trends (which should ignore
 * half-logged days). It does not lock the day: entries can still be edited.
 */
export const diaryDays = pgTable(
  "diary_days",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entryDate: date("entry_date", { mode: "string" }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.entryDate] })],
);

/**
 * Exercise logged for a day, as calories burned. Deliberately minimal: it
 * exists so the day summary can show energy out as well as energy in. The gym
 * tracker (workouts, sets, reps) is a later phase and will add its own tables;
 * it can link to or feed this one.
 */
export const exerciseEntries = pgTable(
  "exercise_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entryDate: date("entry_date", { mode: "string" }).notNull(),
    name: text("name").notNull(),
    durationMin: doublePrecision("duration_min"),
    caloriesBurned: doublePrecision("calories_burned").notNull(),
    loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("exercise_entries_user_date_idx").on(t.userId, t.entryDate),
    check("exercise_entries_calories_nonneg", sql`${t.caloriesBurned} >= 0`),
    check("exercise_entries_duration_pos", sql`${t.durationMin} is null or ${t.durationMin} > 0`),
  ],
);

/** A supplement product (multivitamin, vitamin D drops, creatine...). */
export const supplementProducts = pgTable(
  "supplement_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    brand: text("brand"),
    barcode: text("barcode"),
    /** What one serving is: "1 capsule", "2 gummies", "1 scoop (30 g)". */
    servingLabel: text("serving_label").notNull().default("1 serving"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("supplement_products_owner_idx").on(t.ownerId)],
);

/** Nutrient content of a supplement, per serving. */
export const supplementNutrients = pgTable(
  "supplement_nutrients",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => supplementProducts.id, { onDelete: "cascade" }),
    nutrientId: integer("nutrient_id")
      .notNull()
      .references(() => nutrients.id),
    amountPerServing: doublePrecision("amount_per_serving").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.nutrientId] }),
    check("supplement_nutrients_amount_nonneg", sql`${t.amountPerServing} >= 0`),
  ],
);

/** A user's regular supplement stack, for one-tap "log my stack". */
export const userSupplements = pgTable(
  "user_supplements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => supplementProducts.id, { onDelete: "cascade" }),
    servingsPerDose: doublePrecision("servings_per_dose").notNull().default(1),
    timing: supplementTiming("timing"),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    uniqueIndex("user_supplements_user_product_uq").on(t.userId, t.productId),
    check("user_supplements_servings_pos", sql`${t.servingsPerDose} > 0`),
  ],
);

/** One supplement dose taken. */
export const supplementLogs = pgTable(
  "supplement_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => supplementProducts.id),
    entryDate: date("entry_date", { mode: "string" }).notNull(),
    servings: doublePrecision("servings").notNull().default(1),
    takenAt: timestamp("taken_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("supplement_logs_user_date_idx").on(t.userId, t.entryDate),
    check("supplement_logs_servings_pos", sql`${t.servings} > 0`),
  ],
);
