import { and, eq, sql } from "drizzle-orm";
import type { Database } from "./client";
import {
  diaryEntries,
  foodNutrients,
  nutrients,
  supplementLogs,
  supplementNutrients,
} from "./schema";
import { sumAmounts, type NutrientAmounts } from "../lib/nutrition";

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
