/**
 * Pure nutrition maths. No database or framework imports, so it is trivial to
 * unit test and reusable on client and server.
 *
 * Nutrient amounts are keyed by `NutrientDef.key` ("protein", "vit_c"...), in
 * the unit defined by the catalogue (g, mg, mcg, kcal).
 */

export type NutrientAmounts = Record<string, number>;

/** Energy per gram (Atwater general factors). */
export const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const;

export interface MacroSplit {
  /** Percent of calories, 0-100. Should sum to 100. */
  protein: number;
  carbs: number;
  fat: number;
}

/** Scale a food's per-100 g nutrient amounts to an eaten weight. */
export function scalePer100g(per100g: NutrientAmounts, grams: number): NutrientAmounts {
  return scale(per100g, grams / 100);
}

/** Scale a supplement's per-serving amounts to a number of servings. */
export function scalePerServing(perServing: NutrientAmounts, servings: number): NutrientAmounts {
  return scale(perServing, servings);
}

function scale(amounts: NutrientAmounts, factor: number): NutrientAmounts {
  const out: NutrientAmounts = {};
  for (const [key, value] of Object.entries(amounts)) {
    out[key] = value * factor;
  }
  return out;
}

/** Sum any number of nutrient maps. Keys missing from a map count as zero. */
export function sumAmounts(...parts: NutrientAmounts[]): NutrientAmounts {
  const out: NutrientAmounts = {};
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      out[key] = (out[key] ?? 0) + value;
    }
  }
  return out;
}

/** Weight in grams of `quantity` servings that each weigh `servingGrams`. */
export function servingsToGrams(quantity: number, servingGrams: number): number {
  if (!(quantity > 0)) throw new RangeError("quantity must be greater than 0");
  if (!(servingGrams > 0)) throw new RangeError("servingGrams must be greater than 0");
  return quantity * servingGrams;
}

/** Progress toward a target as a percentage (not capped). Null if there is no usable target. */
export function percentOfTarget(amount: number, target: number | null | undefined): number | null {
  if (target == null || !(target > 0)) return null;
  return (amount / target) * 100;
}

/**
 * Where today's calories came from, as a percent of the calories contributed by
 * protein, carbs and fat (computed from grams, so it works even when the food
 * data's own energy value is missing). Returns zeros when nothing was eaten.
 */
export function macroCalorieSplit(amounts: NutrientAmounts): MacroSplit {
  const protein = (amounts.protein ?? 0) * KCAL_PER_GRAM.protein;
  const carbs = (amounts.carbs ?? 0) * KCAL_PER_GRAM.carbs;
  const fat = (amounts.fat ?? 0) * KCAL_PER_GRAM.fat;
  const total = protein + carbs + fat;
  if (total === 0) return { protein: 0, carbs: 0, fat: 0 };
  return {
    protein: (protein / total) * 100,
    carbs: (carbs / total) * 100,
    fat: (fat / total) * 100,
  };
}

/** Turn a calorie goal and a percent split into daily gram targets. */
export function macroGramsFromSplit(kcal: number, split: MacroSplit): NutrientAmounts {
  const total = split.protein + split.carbs + split.fat;
  if (Math.abs(total - 100) > 0.5) {
    throw new RangeError(`macro split must sum to 100, got ${total}`);
  }
  if (!(kcal >= 0)) throw new RangeError("kcal must be 0 or more");
  return {
    protein: (kcal * (split.protein / 100)) / KCAL_PER_GRAM.protein,
    carbs: (kcal * (split.carbs / 100)) / KCAL_PER_GRAM.carbs,
    fat: (kcal * (split.fat / 100)) / KCAL_PER_GRAM.fat,
  };
}

/**
 * The whole-number protein/carbs/fat percent split that a set of gram targets
 * works out to, measured against the calories those macros supply. Always sums
 * to exactly 100 (largest-remainder rounding), or is all zeros for no grams.
 * The inverse of `macroGramsFromSplit`, for showing existing targets as a split.
 */
export function macroSplitFromGrams(grams: { protein: number; carbs: number; fat: number }): MacroSplit {
  const kcal = {
    protein: Math.max(0, grams.protein) * KCAL_PER_GRAM.protein,
    carbs: Math.max(0, grams.carbs) * KCAL_PER_GRAM.carbs,
    fat: Math.max(0, grams.fat) * KCAL_PER_GRAM.fat,
  };
  const total = kcal.protein + kcal.carbs + kcal.fat;
  if (total === 0) return { protein: 0, carbs: 0, fat: 0 };

  const keys = ["protein", "carbs", "fat"] as const;
  const exact = keys.map((k) => (kcal[k] / total) * 100);
  const floored = exact.map(Math.floor);
  let remainder = 100 - floored.reduce((a, b) => a + b, 0);
  const byFraction = exact.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of byFraction) {
    if (remainder <= 0) break;
    floored[i] = floored[i]! + 1;
    remainder--;
  }
  return { protein: floored[0]!, carbs: floored[1]!, fat: floored[2]! };
}

/** Round for display (not for storage or intermediate maths). */
export function round(value: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
