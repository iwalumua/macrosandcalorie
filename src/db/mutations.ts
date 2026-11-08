import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { Database } from "./client";
import { NUTRIENT_KEYS } from "./nutrient-catalog";
import {
  diaryDays,
  diaryEntries,
  exerciseEntries,
  foodNutrients,
  foods,
  foodServings,
  nutrients,
  nutritionTargets,
  supplementLogs,
  supplementNutrients,
  supplementProducts,
  userSupplements,
  users,
} from "./schema";
import { InputError } from "../lib/errors";
import type { Meal } from "../lib/meals";
import {
  KCAL_PER_GRAM,
  macroGramsFromSplit,
  servingsToGrams,
  type MacroSplit,
  type NutrientAmounts,
} from "../lib/nutrition";
import type { TargetOverride } from "../lib/targets";

/** Anything we can run queries on: the database itself or a transaction. */
type Executor = Pick<Database, "select" | "insert" | "update" | "delete">;

const MAX_TEXT = 120;
const MAX_GRAMS = 50_000;

function cleanText(value: string | null | undefined, label: string, required: boolean): string | null {
  const text = (value ?? "").trim();
  if (!text) {
    if (required) throw new InputError(`${label} is required.`);
    return null;
  }
  if (text.length > MAX_TEXT) throw new InputError(`${label} is too long (max ${MAX_TEXT} characters).`);
  return text;
}

/** Nutrient key -> database id. Throws if the catalogue has not been seeded. */
export async function nutrientIds(ex: Executor): Promise<Map<string, number>> {
  const rows = await ex.select({ id: nutrients.id, key: nutrients.key }).from(nutrients);
  if (rows.length === 0) {
    throw new Error("The nutrients table is empty. Run `npm run db:seed` first.");
  }
  return new Map(rows.map((r) => [r.key, r.id]));
}

/** Validate a nutrient map: known keys, finite and non-negative numbers. */
function cleanAmounts(amounts: NutrientAmounts): [string, number][] {
  const known = new Set(NUTRIENT_KEYS);
  const out: [string, number][] = [];
  for (const [key, value] of Object.entries(amounts)) {
    if (!known.has(key)) throw new InputError(`Unknown nutrient "${key}".`);
    if (!Number.isFinite(value) || value < 0) {
      throw new InputError(`${key} must be a number that is 0 or more.`);
    }
    out.push([key, value]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/**
 * The single built-in user. This is a stopgap until auth is chosen (see
 * docs/DECISIONS.md): every request acts as this one user.
 */
export const LOCAL_USER_EMAIL = "local@macrosandcalorie.local";

export async function ensureLocalUser(db: Database): Promise<{ id: string; timezone: string }> {
  const find = () =>
    db
      .select({ id: users.id, timezone: users.timezone })
      .from(users)
      .where(eq(users.email, LOCAL_USER_EMAIL))
      .limit(1);
  const [existing] = await find();
  if (existing) return existing;
  await db.insert(users).values({ email: LOCAL_USER_EMAIL, name: "You" }).onConflictDoNothing();
  const [created] = await find();
  return created!;
}

export async function setUserTimezone(db: Database, userId: string, timezone: string): Promise<void> {
  await db.update(users).set({ timezone }).where(eq(users.id, userId));
}

// ---------------------------------------------------------------------------
// Foods and the diary
// ---------------------------------------------------------------------------

export interface NewFoodInput {
  name: string;
  brand?: string | null;
  /** What one serving is: "1 slice", "1 cup (240 ml)". */
  servingLabel: string;
  /** Weight of one serving in grams. */
  servingGrams: number;
  /** Nutrient amounts for ONE serving, as printed on a label. Only nutrients that are present are stored. */
  perServing: NutrientAmounts;
}

/**
 * Create a food from label values. Labels give amounts per serving, the database
 * stores per 100 g, so this converts. Nutrients left out are stored as absent
 * (unknown), never as zero, so the summary can tell "no data" from "none".
 * If calories are missing but macros are given, calories are estimated from the
 * macros so day totals stay consistent.
 */
export async function createCustomFood(db: Database, userId: string, input: NewFoodInput): Promise<string> {
  const name = cleanText(input.name, "Name", true)!;
  const brand = cleanText(input.brand, "Brand", false);
  const servingLabel = cleanText(input.servingLabel, "Serving", true)!;
  if (!Number.isFinite(input.servingGrams) || !(input.servingGrams > 0) || input.servingGrams > MAX_GRAMS) {
    throw new InputError("Serving weight must be greater than 0 g.");
  }

  const amounts = new Map(cleanAmounts(input.perServing));
  const hasMacro = ["protein", "carbs", "fat"].some((k) => amounts.has(k));
  if (!amounts.has("energy_kcal") && hasMacro) {
    amounts.set(
      "energy_kcal",
      (amounts.get("protein") ?? 0) * KCAL_PER_GRAM.protein +
        (amounts.get("carbs") ?? 0) * KCAL_PER_GRAM.carbs +
        (amounts.get("fat") ?? 0) * KCAL_PER_GRAM.fat,
    );
  }
  if (amounts.size === 0) throw new InputError("Enter at least calories or one nutrient.");

  return db.transaction(async (tx) => {
    const ids = await nutrientIds(tx);
    const [food] = await tx
      .insert(foods)
      .values({ name, brand, source: "custom", ownerId: userId })
      .returning({ id: foods.id });
    await tx.insert(foodServings).values({
      foodId: food!.id,
      label: servingLabel,
      grams: input.servingGrams,
      isDefault: true,
    });
    await tx.insert(foodNutrients).values(
      [...amounts].map(([key, perServing]) => ({
        foodId: food!.id,
        nutrientId: ids.get(key)!,
        amountPer100g: (perServing * 100) / input.servingGrams,
      })),
    );
    return food!.id;
  });
}

export interface FoodPortion {
  foodId: string;
  /** A serving of this food, or null when `quantity` is in grams. */
  servingId: string | null;
  quantity: number;
}

/** Turn "2 servings" or "150 g" into grams, checking the food and serving are usable by this user. */
async function resolveGrams(ex: Executor, userId: string, portion: FoodPortion): Promise<number> {
  const { foodId, servingId, quantity } = portion;
  if (!Number.isFinite(quantity) || !(quantity > 0)) throw new InputError("Enter an amount greater than 0.");

  const [food] = await ex
    .select({ id: foods.id })
    .from(foods)
    .where(and(eq(foods.id, foodId), or(isNull(foods.ownerId), eq(foods.ownerId, userId))))
    .limit(1);
  if (!food) throw new InputError("That food could not be found.");

  let grams = quantity;
  if (servingId) {
    const [serving] = await ex
      .select({ grams: foodServings.grams })
      .from(foodServings)
      .where(and(eq(foodServings.id, servingId), eq(foodServings.foodId, foodId)))
      .limit(1);
    if (!serving) throw new InputError("That serving does not belong to this food.");
    grams = servingsToGrams(quantity, serving.grams);
  }
  if (grams > MAX_GRAMS) throw new InputError("That amount looks too large.");
  return grams;
}

export interface LogFoodInput extends FoodPortion {
  date: string;
  meal: Meal;
}

export async function logFood(db: Database, userId: string, input: LogFoodInput): Promise<string> {
  const grams = await resolveGrams(db, userId, input);
  const [row] = await db
    .insert(diaryEntries)
    .values({
      userId,
      entryDate: input.date,
      meal: input.meal,
      foodId: input.foodId,
      servingId: input.servingId,
      quantity: input.quantity,
      grams,
    })
    .returning({ id: diaryEntries.id });
  return row!.id;
}

/** Change the amount, serving or meal of an existing entry. Returns false if it is not this user's. */
export async function updateDiaryEntry(
  db: Database,
  userId: string,
  entryId: string,
  change: { meal: Meal; servingId: string | null; quantity: number },
): Promise<boolean> {
  const [entry] = await db
    .select({ foodId: diaryEntries.foodId })
    .from(diaryEntries)
    .where(and(eq(diaryEntries.id, entryId), eq(diaryEntries.userId, userId)))
    .limit(1);
  if (!entry) return false;
  const grams = await resolveGrams(db, userId, { foodId: entry.foodId, ...change });
  await db
    .update(diaryEntries)
    .set({ meal: change.meal, servingId: change.servingId, quantity: change.quantity, grams })
    .where(and(eq(diaryEntries.id, entryId), eq(diaryEntries.userId, userId)));
  return true;
}

export async function deleteDiaryEntry(db: Database, userId: string, entryId: string): Promise<boolean> {
  const rows = await db
    .delete(diaryEntries)
    .where(and(eq(diaryEntries.id, entryId), eq(diaryEntries.userId, userId)))
    .returning({ id: diaryEntries.id });
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Supplements
// ---------------------------------------------------------------------------

export const SUPPLEMENT_TIMINGS = ["morning", "midday", "evening", "bedtime", "with_meal"] as const;
export type SupplementTiming = (typeof SUPPLEMENT_TIMINGS)[number];

export interface NewSupplementInput {
  name: string;
  brand?: string | null;
  /** What one serving is: "1 capsule", "2 gummies", "1 scoop (30 g)". */
  servingLabel: string;
  /** Nutrient amounts for ONE serving, as printed on the label. */
  perServing: NutrientAmounts;
}

export async function createSupplementProduct(
  db: Database,
  userId: string,
  input: NewSupplementInput,
): Promise<string> {
  const name = cleanText(input.name, "Name", true)!;
  const brand = cleanText(input.brand, "Brand", false);
  const servingLabel = cleanText(input.servingLabel, "Serving", true)!;
  const amounts = cleanAmounts(input.perServing);

  return db.transaction(async (tx) => {
    const ids = await nutrientIds(tx);
    const [product] = await tx
      .insert(supplementProducts)
      .values({ ownerId: userId, name, brand, servingLabel })
      .returning({ id: supplementProducts.id });
    if (amounts.length > 0) {
      await tx.insert(supplementNutrients).values(
        amounts.map(([key, amountPerServing]) => ({
          productId: product!.id,
          nutrientId: ids.get(key)!,
          amountPerServing,
        })),
      );
    }
    return product!.id;
  });
}

async function assertSupplementVisible(ex: Executor, userId: string, productId: string): Promise<void> {
  const [p] = await ex
    .select({ id: supplementProducts.id })
    .from(supplementProducts)
    .where(
      and(
        eq(supplementProducts.id, productId),
        or(isNull(supplementProducts.ownerId), eq(supplementProducts.ownerId, userId)),
      ),
    )
    .limit(1);
  if (!p) throw new InputError("That supplement could not be found.");
}

function assertServings(servings: number): void {
  if (!Number.isFinite(servings) || !(servings > 0) || servings > 100) {
    throw new InputError("Servings must be greater than 0.");
  }
}

/** Add a supplement to the user's regular stack, or update its dose/timing. */
export async function setStackItem(
  db: Database,
  userId: string,
  productId: string,
  item: { servingsPerDose: number; timing: SupplementTiming | null },
): Promise<void> {
  assertServings(item.servingsPerDose);
  await assertSupplementVisible(db, userId, productId);
  await db
    .insert(userSupplements)
    .values({ userId, productId, servingsPerDose: item.servingsPerDose, timing: item.timing, active: true })
    .onConflictDoUpdate({
      target: [userSupplements.userId, userSupplements.productId],
      set: { servingsPerDose: item.servingsPerDose, timing: item.timing, active: true },
    });
}

export async function removeStackItem(db: Database, userId: string, productId: string): Promise<void> {
  await db
    .delete(userSupplements)
    .where(and(eq(userSupplements.userId, userId), eq(userSupplements.productId, productId)));
}

export async function logSupplement(
  db: Database,
  userId: string,
  input: { productId: string; date: string; servings: number },
): Promise<string> {
  assertServings(input.servings);
  await assertSupplementVisible(db, userId, input.productId);
  const [row] = await db
    .insert(supplementLogs)
    .values({
      userId,
      productId: input.productId,
      entryDate: input.date,
      servings: input.servings,
      takenAt: new Date(),
    })
    .returning({ id: supplementLogs.id });
  return row!.id;
}

/**
 * Log every active stack item that has not been logged yet on `date`
 * (optionally only those with a given timing). Items already logged are
 * skipped, so tapping twice cannot double-count. Returns how many were logged.
 */
export async function logStackRemaining(
  db: Database,
  userId: string,
  date: string,
  timing?: SupplementTiming,
): Promise<number> {
  return db.transaction(async (tx) => {
    const stack = await tx
      .select({
        productId: userSupplements.productId,
        servingsPerDose: userSupplements.servingsPerDose,
        timing: userSupplements.timing,
      })
      .from(userSupplements)
      .where(and(eq(userSupplements.userId, userId), eq(userSupplements.active, true)));
    const due = stack.filter((s) => (timing ? s.timing === timing : true));
    if (due.length === 0) return 0;

    const already = await tx
      .select({ productId: supplementLogs.productId })
      .from(supplementLogs)
      .where(
        and(
          eq(supplementLogs.userId, userId),
          eq(supplementLogs.entryDate, date),
          inArray(supplementLogs.productId, due.map((d) => d.productId)),
        ),
      );
    const done = new Set(already.map((a) => a.productId));
    const todo = due.filter((d) => !done.has(d.productId));
    if (todo.length === 0) return 0;

    await tx.insert(supplementLogs).values(
      todo.map((t) => ({
        userId,
        productId: t.productId,
        entryDate: date,
        servings: t.servingsPerDose,
        takenAt: new Date(),
      })),
    );
    return todo.length;
  });
}

export async function deleteSupplementLog(db: Database, userId: string, logId: string): Promise<boolean> {
  const rows = await db
    .delete(supplementLogs)
    .where(and(eq(supplementLogs.id, logId), eq(supplementLogs.userId, userId)))
    .returning({ id: supplementLogs.id });
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Exercise and day completion
// ---------------------------------------------------------------------------

export async function addExercise(
  db: Database,
  userId: string,
  input: { date: string; name: string; durationMin: number | null; caloriesBurned: number },
): Promise<string> {
  const name = cleanText(input.name, "Activity", true)!;
  if (!Number.isFinite(input.caloriesBurned) || input.caloriesBurned < 0 || input.caloriesBurned > 20_000) {
    throw new InputError("Calories burned must be between 0 and 20,000.");
  }
  if (input.durationMin !== null && (!Number.isFinite(input.durationMin) || !(input.durationMin > 0) || input.durationMin > 1440)) {
    throw new InputError("Duration must be between 1 and 1,440 minutes.");
  }
  const [row] = await db
    .insert(exerciseEntries)
    .values({
      userId,
      entryDate: input.date,
      name,
      durationMin: input.durationMin,
      caloriesBurned: input.caloriesBurned,
    })
    .returning({ id: exerciseEntries.id });
  return row!.id;
}

export async function deleteExercise(db: Database, userId: string, exerciseId: string): Promise<boolean> {
  const rows = await db
    .delete(exerciseEntries)
    .where(and(eq(exerciseEntries.id, exerciseId), eq(exerciseEntries.userId, userId)))
    .returning({ id: exerciseEntries.id });
  return rows.length > 0;
}

/** Mark a diary day complete, or re-open it. Idempotent either way. */
export async function setDayComplete(
  db: Database,
  userId: string,
  date: string,
  complete: boolean,
): Promise<void> {
  if (complete) {
    await db.insert(diaryDays).values({ userId, entryDate: date }).onConflictDoNothing();
  } else {
    await db.delete(diaryDays).where(and(eq(diaryDays.userId, userId), eq(diaryDays.entryDate, date)));
  }
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

/** Save the user's own targets, replacing the generic default for each nutrient given. */
export async function saveTargets(
  db: Database,
  userId: string,
  targets: Record<string, TargetOverride>,
): Promise<void> {
  const entries = Object.entries(targets);
  if (entries.length === 0) return;
  const known = new Set(NUTRIENT_KEYS);
  for (const [key, t] of entries) {
    if (!known.has(key)) throw new InputError(`Unknown nutrient "${key}".`);
    if (!Number.isFinite(t.target) || t.target < 0) throw new InputError(`Target for ${key} must be 0 or more.`);
    if (t.upperLimit !== null && (!Number.isFinite(t.upperLimit) || !(t.upperLimit > 0))) {
      throw new InputError(`Upper limit for ${key} must be greater than 0.`);
    }
  }
  await db.transaction(async (tx) => {
    const ids = await nutrientIds(tx);
    for (const [key, t] of entries) {
      await tx
        .insert(nutritionTargets)
        .values({ userId, nutrientId: ids.get(key)!, target: t.target, upperLimit: t.upperLimit })
        .onConflictDoUpdate({
          target: [nutritionTargets.userId, nutritionTargets.nutrientId],
          set: { target: t.target, upperLimit: t.upperLimit },
        });
    }
  });
}

/** Go back to the generic default for these nutrients. */
export async function resetTargets(db: Database, userId: string, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const ids = await nutrientIds(db);
  const nutrientIdList = keys.flatMap((k) => (ids.has(k) ? [ids.get(k)!] : []));
  if (nutrientIdList.length === 0) return;
  await db
    .delete(nutritionTargets)
    .where(and(eq(nutritionTargets.userId, userId), inArray(nutritionTargets.nutrientId, nutrientIdList)));
}

/** Set a calorie goal and split it into protein, carb and fat gram targets. */
export async function saveCalorieGoal(
  db: Database,
  userId: string,
  kcal: number,
  split: MacroSplit,
): Promise<void> {
  if (!Number.isFinite(kcal) || kcal < 500 || kcal > 10_000) {
    throw new InputError("Calorie goal must be between 500 and 10,000.");
  }
  let grams: NutrientAmounts;
  try {
    grams = macroGramsFromSplit(kcal, split);
  } catch (e) {
    if (e instanceof RangeError) throw new InputError("Protein, carbs and fat must add up to 100%.");
    throw e;
  }
  await saveTargets(db, userId, {
    energy_kcal: { target: kcal, upperLimit: null },
    protein: { target: grams.protein!, upperLimit: null },
    carbs: { target: grams.carbs!, upperLimit: null },
    fat: { target: grams.fat!, upperLimit: null },
  });
}
