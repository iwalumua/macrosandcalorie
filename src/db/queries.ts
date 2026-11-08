import { and, asc, desc, eq, ilike, inArray, isNull, max, or, sql } from "drizzle-orm";
import type { Database } from "./client";
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
} from "./schema";
import type { Meal } from "../lib/meals";
import { scalePer100g, sumAmounts, type NutrientAmounts } from "../lib/nutrition";
import type { TargetOverride } from "../lib/targets";

export interface DailyTotals {
  /** Nutrients from the food diary. */
  foods: NutrientAmounts;
  /** Nutrients from logged supplements. */
  supplements: NutrientAmounts;
  /** foods + supplements: what the day's targets are measured against. */
  total: NutrientAmounts;
}

/**
 * Nutrient totals for one user on one local calendar day (`YYYY-MM-DD`),
 * aggregated in SQL and split by source so the UI can show how much of each
 * nutrient came from supplements.
 */
export async function getDailyTotals(
  db: Database,
  userId: string,
  date: string,
): Promise<DailyTotals> {
  const foodRows = await db
    .select({
      key: nutrients.key,
      amount: sql<number>`sum(${foodNutrients.amountPer100g} * ${diaryEntries.grams} / 100.0)`,
    })
    .from(diaryEntries)
    .innerJoin(foodNutrients, eq(foodNutrients.foodId, diaryEntries.foodId))
    .innerJoin(nutrients, eq(nutrients.id, foodNutrients.nutrientId))
    .where(and(eq(diaryEntries.userId, userId), eq(diaryEntries.entryDate, date)))
    .groupBy(nutrients.key);

  const supplementRows = await db
    .select({
      key: nutrients.key,
      amount: sql<number>`sum(${supplementNutrients.amountPerServing} * ${supplementLogs.servings})`,
    })
    .from(supplementLogs)
    .innerJoin(
      supplementNutrients,
      eq(supplementNutrients.productId, supplementLogs.productId),
    )
    .innerJoin(nutrients, eq(nutrients.id, supplementNutrients.nutrientId))
    .where(and(eq(supplementLogs.userId, userId), eq(supplementLogs.entryDate, date)))
    .groupBy(nutrients.key);

  const foods = toAmounts(foodRows);
  const supplements = toAmounts(supplementRows);
  return { foods, supplements, total: sumAmounts(foods, supplements) };
}

function toAmounts(rows: { key: string; amount: number }[]): NutrientAmounts {
  return Object.fromEntries(rows.map((r) => [r.key, Number(r.amount)]));
}

// ---------------------------------------------------------------------------
// Foods
// ---------------------------------------------------------------------------

/** The four values shown beside a food in lists and used for per-meal totals. */
const LIST_KEYS = ["energy_kcal", "protein", "carbs", "fat"] as const;

/** Escape `%`, `_` and `\` so user text is matched literally by LIKE/ILIKE. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export interface FoodListItem {
  id: string;
  name: string;
  brand: string | null;
  source: "usda" | "off" | "custom";
  /** Whether this is one of the user's own foods. */
  custom: boolean;
  kcalPer100g: number | null;
  defaultServing: { label: string; grams: number } | null;
}

const isVisibleTo = (userId: string) => or(isNull(foods.ownerId), eq(foods.ownerId, userId));

async function toFoodListItems(
  db: Database,
  rows: { id: string; name: string; brand: string | null; source: "usda" | "off" | "custom"; ownerId: string | null }[],
): Promise<FoodListItem[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [energy, servings] = await Promise.all([
    db
      .select({ foodId: foodNutrients.foodId, amount: foodNutrients.amountPer100g })
      .from(foodNutrients)
      .innerJoin(nutrients, eq(nutrients.id, foodNutrients.nutrientId))
      .where(and(inArray(foodNutrients.foodId, ids), eq(nutrients.key, "energy_kcal"))),
    db
      .select({ foodId: foodServings.foodId, label: foodServings.label, grams: foodServings.grams })
      .from(foodServings)
      .where(and(inArray(foodServings.foodId, ids), eq(foodServings.isDefault, true))),
  ]);
  const kcal = new Map(energy.map((e) => [e.foodId, e.amount]));
  const serving = new Map(servings.map((s) => [s.foodId, { label: s.label, grams: s.grams }]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    brand: r.brand,
    source: r.source,
    custom: r.ownerId !== null,
    kcalPer100g: kcal.get(r.id) ?? null,
    defaultServing: serving.get(r.id) ?? null,
  }));
}

/**
 * Foods the user can log: shared foods plus their own. Every word in `query`
 * must appear in the name or brand (case-insensitive); names that start with
 * the query rank first, then shorter names. An empty query lists the most
 * recently added foods.
 */
export async function searchFoods(
  db: Database,
  userId: string,
  query: string,
  limit = 30,
): Promise<FoodListItem[]> {
  const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 6);
  const matches = words.map((w) => {
    const pattern = `%${escapeLike(w)}%`;
    return or(ilike(foods.name, pattern), ilike(foods.brand, pattern));
  });
  const prefix = `${escapeLike(query.trim())}%`;
  const order =
    words.length > 0
      ? [
          sql`(case when ${foods.name} ilike ${prefix} then 0 else 1 end)`,
          sql`length(${foods.name})`,
          asc(foods.name),
        ]
      : [desc(foods.createdAt)];
  const rows = await db
    .select({
      id: foods.id,
      name: foods.name,
      brand: foods.brand,
      source: foods.source,
      ownerId: foods.ownerId,
    })
    .from(foods)
    .where(and(isVisibleTo(userId), ...matches))
    .orderBy(...order)
    .limit(limit);
  return toFoodListItems(db, rows);
}

/** Foods the user logged most recently, newest first. */
export async function listRecentFoods(db: Database, userId: string, limit = 12): Promise<FoodListItem[]> {
  const recent = await db
    .select({ foodId: diaryEntries.foodId, last: max(diaryEntries.loggedAt) })
    .from(diaryEntries)
    .where(eq(diaryEntries.userId, userId))
    .groupBy(diaryEntries.foodId)
    .orderBy(desc(max(diaryEntries.loggedAt)))
    .limit(limit);
  if (recent.length === 0) return [];
  const rows = await db
    .select({ id: foods.id, name: foods.name, brand: foods.brand, source: foods.source, ownerId: foods.ownerId })
    .from(foods)
    .where(and(inArray(foods.id, recent.map((r) => r.foodId)), isVisibleTo(userId)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = recent.flatMap((r) => {
    const row = byId.get(r.foodId);
    return row ? [row] : [];
  });
  return toFoodListItems(db, ordered);
}

export interface FoodDetail {
  id: string;
  name: string;
  brand: string | null;
  custom: boolean;
  servings: { id: string; label: string; grams: number; isDefault: boolean }[];
  /** All nutrient amounts the food reports, per 100 g, keyed by nutrient key. */
  per100g: NutrientAmounts;
}

/** One food with its servings and nutrients, or null if it does not exist or is not visible to the user. */
export async function getFood(db: Database, userId: string, foodId: string): Promise<FoodDetail | null> {
  const [food] = await db
    .select({ id: foods.id, name: foods.name, brand: foods.brand, ownerId: foods.ownerId })
    .from(foods)
    .where(and(eq(foods.id, foodId), isVisibleTo(userId)))
    .limit(1);
  if (!food) return null;
  const [servings, amounts] = await Promise.all([
    db
      .select({ id: foodServings.id, label: foodServings.label, grams: foodServings.grams, isDefault: foodServings.isDefault })
      .from(foodServings)
      .where(eq(foodServings.foodId, foodId))
      .orderBy(desc(foodServings.isDefault), asc(foodServings.grams)),
    db
      .select({ key: nutrients.key, amount: foodNutrients.amountPer100g })
      .from(foodNutrients)
      .innerJoin(nutrients, eq(nutrients.id, foodNutrients.nutrientId))
      .where(eq(foodNutrients.foodId, foodId)),
  ]);
  return {
    id: food.id,
    name: food.name,
    brand: food.brand,
    custom: food.ownerId !== null,
    servings,
    per100g: Object.fromEntries(amounts.map((a) => [a.key, a.amount])),
  };
}

// ---------------------------------------------------------------------------
// The diary for one day
// ---------------------------------------------------------------------------

export interface DiaryEntryView {
  id: string;
  meal: Meal;
  foodId: string;
  name: string;
  brand: string | null;
  /** Number of servings; meaningful only when `servingLabel` is set. */
  quantity: number;
  servingId: string | null;
  servingLabel: string | null;
  grams: number;
  /** Energy, protein, carbs and fat for this entry as eaten. */
  amounts: NutrientAmounts;
}

export interface SupplementLogView {
  id: string;
  productId: string;
  name: string;
  brand: string | null;
  servingLabel: string;
  servings: number;
}

export interface ExerciseView {
  id: string;
  name: string;
  durationMin: number | null;
  caloriesBurned: number;
}

export interface DiaryDay {
  date: string;
  complete: boolean;
  entries: DiaryEntryView[];
  supplementLogs: SupplementLogView[];
  exercise: ExerciseView[];
}

/** Everything logged on one local calendar day, in the order it was logged. */
export async function getDiaryDay(db: Database, userId: string, date: string): Promise<DiaryDay> {
  const [entryRows, supplementRows, exerciseRows, completed] = await Promise.all([
    db
      .select({
        id: diaryEntries.id,
        meal: diaryEntries.meal,
        foodId: diaryEntries.foodId,
        name: foods.name,
        brand: foods.brand,
        quantity: diaryEntries.quantity,
        servingId: diaryEntries.servingId,
        servingLabel: foodServings.label,
        grams: diaryEntries.grams,
      })
      .from(diaryEntries)
      .innerJoin(foods, eq(foods.id, diaryEntries.foodId))
      .leftJoin(foodServings, eq(foodServings.id, diaryEntries.servingId))
      .where(and(eq(diaryEntries.userId, userId), eq(diaryEntries.entryDate, date)))
      .orderBy(asc(diaryEntries.loggedAt)),
    db
      .select({
        id: supplementLogs.id,
        productId: supplementLogs.productId,
        name: supplementProducts.name,
        brand: supplementProducts.brand,
        servingLabel: supplementProducts.servingLabel,
        servings: supplementLogs.servings,
      })
      .from(supplementLogs)
      .innerJoin(supplementProducts, eq(supplementProducts.id, supplementLogs.productId))
      .where(and(eq(supplementLogs.userId, userId), eq(supplementLogs.entryDate, date)))
      .orderBy(asc(supplementLogs.createdAt)),
    db
      .select({
        id: exerciseEntries.id,
        name: exerciseEntries.name,
        durationMin: exerciseEntries.durationMin,
        caloriesBurned: exerciseEntries.caloriesBurned,
      })
      .from(exerciseEntries)
      .where(and(eq(exerciseEntries.userId, userId), eq(exerciseEntries.entryDate, date)))
      .orderBy(asc(exerciseEntries.loggedAt)),
    db
      .select({ d: diaryDays.entryDate })
      .from(diaryDays)
      .where(and(eq(diaryDays.userId, userId), eq(diaryDays.entryDate, date)))
      .limit(1),
  ]);

  const foodIds = [...new Set(entryRows.map((e) => e.foodId))];
  const per100 = new Map<string, NutrientAmounts>();
  if (foodIds.length > 0) {
    const amountRows = await db
      .select({ foodId: foodNutrients.foodId, key: nutrients.key, amount: foodNutrients.amountPer100g })
      .from(foodNutrients)
      .innerJoin(nutrients, eq(nutrients.id, foodNutrients.nutrientId))
      .where(and(inArray(foodNutrients.foodId, foodIds), inArray(nutrients.key, [...LIST_KEYS])));
    for (const r of amountRows) {
      const m = per100.get(r.foodId) ?? {};
      m[r.key] = r.amount;
      per100.set(r.foodId, m);
    }
  }

  return {
    date,
    complete: completed.length > 0,
    entries: entryRows.map((e) => ({
      ...e,
      amounts: scalePer100g(per100.get(e.foodId) ?? {}, e.grams),
    })),
    supplementLogs: supplementRows,
    exercise: exerciseRows,
  };
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

/** The targets the user has set themselves, by nutrient key. Others fall back to the generic defaults. */
export async function getTargetOverrides(
  db: Database,
  userId: string,
): Promise<Record<string, TargetOverride>> {
  const rows = await db
    .select({ key: nutrients.key, target: nutritionTargets.target, upperLimit: nutritionTargets.upperLimit })
    .from(nutritionTargets)
    .innerJoin(nutrients, eq(nutrients.id, nutritionTargets.nutrientId))
    .where(eq(nutritionTargets.userId, userId));
  return Object.fromEntries(rows.map((r) => [r.key, { target: r.target, upperLimit: r.upperLimit }]));
}

// ---------------------------------------------------------------------------
// Supplements
// ---------------------------------------------------------------------------

export interface SupplementProductView {
  id: string;
  name: string;
  brand: string | null;
  servingLabel: string;
  /** Nutrient amounts per serving, keyed by nutrient key. */
  perServing: NutrientAmounts;
  /** Present when the product is in the user's regular stack. */
  stack: { servingsPerDose: number; timing: string | null; active: boolean } | null;
}

/** The user's supplement products (their own and shared), each marked with its place in their stack. */
export async function listSupplementProducts(db: Database, userId: string): Promise<SupplementProductView[]> {
  const products = await db
    .select({
      id: supplementProducts.id,
      name: supplementProducts.name,
      brand: supplementProducts.brand,
      servingLabel: supplementProducts.servingLabel,
    })
    .from(supplementProducts)
    .where(or(isNull(supplementProducts.ownerId), eq(supplementProducts.ownerId, userId)))
    .orderBy(asc(supplementProducts.name));
  if (products.length === 0) return [];

  const ids = products.map((p) => p.id);
  const [amountRows, stackRows] = await Promise.all([
    db
      .select({ productId: supplementNutrients.productId, key: nutrients.key, amount: supplementNutrients.amountPerServing })
      .from(supplementNutrients)
      .innerJoin(nutrients, eq(nutrients.id, supplementNutrients.nutrientId))
      .where(inArray(supplementNutrients.productId, ids)),
    db
      .select({
        productId: userSupplements.productId,
        servingsPerDose: userSupplements.servingsPerDose,
        timing: userSupplements.timing,
        active: userSupplements.active,
      })
      .from(userSupplements)
      .where(and(eq(userSupplements.userId, userId), inArray(userSupplements.productId, ids))),
  ]);

  const amounts = new Map<string, NutrientAmounts>();
  for (const r of amountRows) {
    const m = amounts.get(r.productId) ?? {};
    m[r.key] = r.amount;
    amounts.set(r.productId, m);
  }
  const stack = new Map(stackRows.map((s) => [s.productId, s]));
  return products.map((p) => ({
    ...p,
    perServing: amounts.get(p.id) ?? {},
    stack: stack.has(p.id)
      ? {
          servingsPerDose: stack.get(p.id)!.servingsPerDose,
          timing: stack.get(p.id)!.timing,
          active: stack.get(p.id)!.active,
        }
      : null,
  }));
}
