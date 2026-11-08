import type { NutrientAmounts } from "./nutrition";
import { KCAL_PER_GRAM } from "./nutrition";

/** A named portion of a food and its weight. */
export interface ImportedServing {
  label: string;
  grams: number;
}

/**
 * A food read from an outside database, in the shape the app stores:
 * nutrient amounts per 100 g, keyed by catalogue key, in catalogue units.
 */
export interface ImportedFood {
  source: "usda" | "off";
  /** The source's own id (USDA FDC id, Open Food Facts barcode). Re-importing updates by this. */
  sourceId: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  /** Which release of the source this came from, e.g. "foundation". Optional. */
  dataset?: string | null;
  per100g: NutrientAmounts;
  /** The first serving becomes the default. */
  servings: ImportedServing[];
}

/**
 * Calories estimated from protein, carbs and fat (4/4/9 kcal per gram), or
 * undefined when none of the three is known. Used when a source gives macros
 * but no energy value, so day totals stay consistent.
 */
export function estimateEnergyKcal(per100g: NutrientAmounts): number | undefined {
  const { protein, carbs, fat } = per100g;
  if (protein === undefined && carbs === undefined && fat === undefined) return undefined;
  return (
    (protein ?? 0) * KCAL_PER_GRAM.protein +
    (carbs ?? 0) * KCAL_PER_GRAM.carbs +
    (fat ?? 0) * KCAL_PER_GRAM.fat
  );
}
