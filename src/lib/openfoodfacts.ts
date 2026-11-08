/**
 * Turns an Open Food Facts product into a food the app can store. Pure: JSON in,
 * result out, no network, so it is unit tested with synthetic products.
 *
 * Open Food Facts is crowd-sourced, so this is deliberately suspicious:
 * - `<nutrient>_100g` values are in GRAMS for everything except energy (checked
 *   on real products: vitamin C of 0.022 means 22 mg), so each is converted to the
 *   catalogue's unit.
 * - A nutrient whose declared unit is not a mass (IU, %, % vol) is skipped, as are
 *   vitamin A and folate, whose definitions (IU / RAE, folic acid / DFE) do not
 *   match what the catalogue tracks, and alcohol, which is "% vol" here.
 * - Impossible values are dropped, and a product whose macros add up to more than
 *   100 g per 100 g is refused outright rather than stored.
 */

import { NUTRIENT_CATALOG, type NutrientDef } from "../db/nutrient-catalog";
import { estimateEnergyKcal, type ImportedFood, type ImportedServing } from "./food-import";
import type { NutrientAmounts } from "./nutrition";

/** Open Food Facts nutriment name -> catalogue key. Anything not listed is not imported. */
const NUTRIMENTS: readonly (readonly [offName: string, key: string])[] = [
  ["proteins", "protein"],
  ["carbohydrates", "carbs"],
  ["fat", "fat"],
  ["fiber", "fiber"],
  ["sugars", "sugars"],
  ["added-sugars", "added_sugars"],
  ["saturated-fat", "sat_fat"],
  ["monounsaturated-fat", "mono_fat"],
  ["polyunsaturated-fat", "poly_fat"],
  ["trans-fat", "trans_fat"],
  ["cholesterol", "cholesterol"],
  ["alpha-linolenic-acid", "omega3_ala"],
  ["eicosapentaenoic-acid", "omega3_epa"],
  ["docosahexaenoic-acid", "omega3_dha"],
  ["vitamin-c", "vit_c"],
  ["vitamin-d", "vit_d"],
  ["vitamin-e", "vit_e"],
  ["vitamin-k", "vit_k"],
  ["vitamin-b1", "thiamin"],
  ["vitamin-b2", "riboflavin"],
  ["vitamin-pp", "niacin"],
  ["pantothenic-acid", "pantothenic_acid"],
  ["vitamin-b6", "vit_b6"],
  ["biotin", "biotin"],
  ["vitamin-b12", "vit_b12"],
  ["calcium", "calcium"],
  ["iron", "iron"],
  ["magnesium", "magnesium"],
  ["phosphorus", "phosphorus"],
  ["potassium", "potassium"],
  ["zinc", "zinc"],
  ["copper", "copper"],
  ["manganese", "manganese"],
  ["selenium", "selenium"],
  ["iodine", "iodine"],
  ["chromium", "chromium"],
  ["molybdenum", "molybdenum"],
  ["caffeine", "caffeine"],
];

const MASS_UNITS = new Set(["g", "mg", "µg", "μg", "mcg", "ug"]);
/** Grams -> the catalogue's unit. */
const FROM_GRAMS: Record<string, number> = { g: 1, mg: 1_000, mcg: 1_000_000 };
const KJ_PER_KCAL = 4.184;
/** Pure fat is ~884 kcal per 100 g, alcohol ~700. Anything above this is a data error. */
const MAX_KCAL_PER_100G = 950;
/** Sodium in salt: salt = sodium x 2.5. */
const SALT_TO_SODIUM = 1 / 2.5;

/** A product barcode as people type it: 8 to 14 digits (EAN-8, UPC-A, EAN-13, GTIN-14). */
export function isBarcode(value: string): boolean {
  return /^\d{8,14}$/.test(value);
}

/**
 * Whether the last digit is the correct GS1 check digit. A typo in a typed
 * barcode almost always breaks this, so it is used to give a helpful hint, not
 * to refuse the lookup (a few valid products carry non-standard codes).
 */
export function hasValidCheckDigit(code: string): boolean {
  if (!isBarcode(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop()!;
  const sum = digits
    .reverse()
    .reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export type OffReason = "not_found" | "no_name" | "no_nutrition" | "inconsistent";
export type OffResult = { ok: true; food: ImportedFood } | { ok: false; reason: OffReason };

const num = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t === "" ? null : t.slice(0, max);
};

export function mapOffProduct(
  json: unknown,
  catalog: readonly NutrientDef[] = NUTRIENT_CATALOG,
): OffResult {
  const root = (json ?? {}) as { status?: unknown; product?: Record<string, unknown> };
  const p = root.product;
  if (!p || typeof p !== "object" || root.status === 0) return { ok: false, reason: "not_found" };

  const code = typeof p.code === "string" ? p.code.trim() : "";
  const name = text(p.product_name, 200) ?? text(p.generic_name, 200);
  if (!isBarcode(code)) return { ok: false, reason: "not_found" };
  if (!name) return { ok: false, reason: "no_name" };

  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const unitOf = new Map(catalog.map((c) => [c.key, c.unit]));
  const per100g: NutrientAmounts = {};

  for (const [offName, key] of NUTRIMENTS) {
    const unit = unitOf.get(key);
    const factor = unit ? FROM_GRAMS[unit] : undefined;
    const grams = num(n[`${offName}_100g`]);
    if (factor === undefined || grams === undefined) continue;
    const declared = n[`${offName}_unit`];
    if (typeof declared === "string" && declared !== "" && !MASS_UNITS.has(declared)) continue;
    if (grams > 100) continue; // more than 100 g of a thing in 100 g of food: a typo
    per100g[key] = grams * factor;
  }

  // Sodium: use it if given, otherwise derive it from salt.
  if (per100g.sodium === undefined) {
    const sodiumG = num(n["sodium_100g"]);
    const saltG = num(n["salt_100g"]);
    const g = sodiumG !== undefined && sodiumG <= 100 ? sodiumG : saltG !== undefined && saltG <= 100 ? saltG * SALT_TO_SODIUM : undefined;
    if (g !== undefined) per100g.sodium = g * 1_000;
  }

  // Energy: kcal if given, otherwise convert kJ, otherwise estimate from macros.
  const kcal = num(n["energy-kcal_100g"]);
  const kj = num(n["energy-kj_100g"]) ?? num(n["energy_100g"]);
  const energy = kcal ?? (kj !== undefined ? kj / KJ_PER_KCAL : undefined);
  if (energy !== undefined && energy <= MAX_KCAL_PER_100G) per100g.energy_kcal = energy;

  const macroGrams = (per100g.protein ?? 0) + (per100g.carbs ?? 0) + (per100g.fat ?? 0);
  if (macroGrams > 105) return { ok: false, reason: "inconsistent" };

  if (per100g.energy_kcal === undefined) {
    const estimate = estimateEnergyKcal(per100g);
    if (estimate === undefined) return { ok: false, reason: "no_nutrition" };
    per100g.energy_kcal = estimate;
  }

  const servings: ImportedServing[] = [];
  const servingGrams = num(p.serving_quantity);
  const servingLabel = text(p.serving_size, 60);
  if (servingGrams !== undefined && servingGrams > 0 && servingGrams <= 5_000 && servingLabel) {
    servings.push({ label: servingLabel, grams: servingGrams });
  }

  return {
    ok: true,
    food: {
      source: "off",
      sourceId: code,
      name,
      brand: text(p.brands, 120),
      barcode: code,
      per100g,
      servings,
    },
  };
}

/** What to tell the person when a lookup does not produce a food. */
export function describeOffFailure(
  reason: OffReason | "unavailable" | "rate_limited",
  barcode: string,
): string {
  const addYourself = "You can add it yourself from the label.";
  switch (reason) {
    case "not_found":
      return `Open Food Facts does not have that barcode yet.${hasValidCheckDigit(barcode) ? "" : " The last digit does not add up, so check for a typo."} ${addYourself}`;
    case "no_name":
      return `Open Food Facts lists that barcode without a product name. ${addYourself}`;
    case "no_nutrition":
      return `Open Food Facts lists that product but without nutrition facts. ${addYourself}`;
    case "inconsistent":
      return `That product's data on Open Food Facts looks wrong (its nutrients add up to more than 100 g per 100 g), so it was not imported. ${addYourself}`;
    case "rate_limited":
      return "Open Food Facts is busy. Try again in a minute.";
    case "unavailable":
      return "Could not reach Open Food Facts right now. Try again in a moment.";
  }
}
