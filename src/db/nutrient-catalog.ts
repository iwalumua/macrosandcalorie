/**
 * The nutrients the app can track. This is the single source of truth: the
 * seed script upserts it into the `nutrients` table, and the domain code in
 * src/lib refers to nutrients by `key`.
 *
 * - Amounts are stored per 100 g (foods) or per serving (supplements) in `unit`.
 * - `dailyValue` is the FDA adult Daily Value used on US nutrition labels
 *   (2020 labelling rules). It is a *generic* reference, not a personalised
 *   target. Personalised DRIs by age/sex are on the roadmap (docs/PRODUCT.md).
 * - `usdaNumber` maps to the USDA FoodData Central nutrient number, for the
 *   future importer. Left undefined where the number has not been confirmed.
 *   Verify every mapping against FDC before relying on it in the importer.
 */

export const NUTRIENT_UNITS = ["kcal", "g", "mg", "mcg", "IU"] as const;
export type NutrientUnit = (typeof NUTRIENT_UNITS)[number];

export const NUTRIENT_CATEGORIES = [
  "energy",
  "macro",
  "lipid",
  "vitamin",
  "mineral",
  "other",
] as const;
export type NutrientCategory = (typeof NUTRIENT_CATEGORIES)[number];

export interface NutrientDef {
  key: string;
  name: string;
  unit: NutrientUnit;
  category: NutrientCategory;
  usdaNumber?: string;
  dailyValue?: number;
}

function group(
  category: NutrientCategory,
  items: Omit<NutrientDef, "category">[],
): NutrientDef[] {
  return items.map((item) => ({ ...item, category }));
}

export const NUTRIENT_CATALOG: readonly NutrientDef[] = [
  ...group("energy", [
    { key: "energy_kcal", name: "Energy", unit: "kcal", usdaNumber: "208", dailyValue: 2000 },
  ]),
  ...group("macro", [
    { key: "protein", name: "Protein", unit: "g", usdaNumber: "203", dailyValue: 50 },
    { key: "carbs", name: "Carbohydrates", unit: "g", usdaNumber: "205", dailyValue: 275 },
    { key: "fiber", name: "Fiber", unit: "g", usdaNumber: "291", dailyValue: 28 },
    { key: "sugars", name: "Sugars", unit: "g", usdaNumber: "269" },
    { key: "added_sugars", name: "Added Sugars", unit: "g", dailyValue: 50 },
    { key: "fat", name: "Fat", unit: "g", usdaNumber: "204", dailyValue: 78 },
  ]),
  ...group("lipid", [
    { key: "sat_fat", name: "Saturated Fat", unit: "g", usdaNumber: "606", dailyValue: 20 },
    { key: "mono_fat", name: "Monounsaturated Fat", unit: "g", usdaNumber: "645" },
    { key: "poly_fat", name: "Polyunsaturated Fat", unit: "g", usdaNumber: "646" },
    { key: "trans_fat", name: "Trans Fat", unit: "g", usdaNumber: "605" },
    { key: "cholesterol", name: "Cholesterol", unit: "mg", usdaNumber: "601", dailyValue: 300 },
    { key: "omega3_ala", name: "Omega-3 ALA", unit: "g", usdaNumber: "851" },
    { key: "omega3_epa", name: "Omega-3 EPA", unit: "g", usdaNumber: "629" },
    { key: "omega3_dha", name: "Omega-3 DHA", unit: "g", usdaNumber: "621" },
  ]),
  ...group("vitamin", [
    { key: "vit_a", name: "Vitamin A (RAE)", unit: "mcg", usdaNumber: "320", dailyValue: 900 },
    { key: "vit_c", name: "Vitamin C", unit: "mg", usdaNumber: "401", dailyValue: 90 },
    { key: "vit_d", name: "Vitamin D", unit: "mcg", usdaNumber: "328", dailyValue: 20 },
    { key: "vit_e", name: "Vitamin E", unit: "mg", usdaNumber: "323", dailyValue: 15 },
    { key: "vit_k", name: "Vitamin K", unit: "mcg", usdaNumber: "430", dailyValue: 120 },
    { key: "thiamin", name: "Thiamin (B1)", unit: "mg", usdaNumber: "404", dailyValue: 1.2 },
    { key: "riboflavin", name: "Riboflavin (B2)", unit: "mg", usdaNumber: "405", dailyValue: 1.3 },
    { key: "niacin", name: "Niacin (B3)", unit: "mg", usdaNumber: "406", dailyValue: 16 },
    { key: "pantothenic_acid", name: "Pantothenic Acid (B5)", unit: "mg", usdaNumber: "410", dailyValue: 5 },
    { key: "vit_b6", name: "Vitamin B6", unit: "mg", usdaNumber: "415", dailyValue: 1.7 },
    { key: "biotin", name: "Biotin (B7)", unit: "mcg", usdaNumber: "416", dailyValue: 30 },
    { key: "folate", name: "Folate (DFE)", unit: "mcg", usdaNumber: "435", dailyValue: 400 },
    { key: "vit_b12", name: "Vitamin B12", unit: "mcg", usdaNumber: "418", dailyValue: 2.4 },
    { key: "choline", name: "Choline", unit: "mg", usdaNumber: "421", dailyValue: 550 },
  ]),
  ...group("mineral", [
    { key: "calcium", name: "Calcium", unit: "mg", usdaNumber: "301", dailyValue: 1300 },
    { key: "iron", name: "Iron", unit: "mg", usdaNumber: "303", dailyValue: 18 },
    { key: "magnesium", name: "Magnesium", unit: "mg", usdaNumber: "304", dailyValue: 420 },
    { key: "phosphorus", name: "Phosphorus", unit: "mg", usdaNumber: "305", dailyValue: 1250 },
    { key: "potassium", name: "Potassium", unit: "mg", usdaNumber: "306", dailyValue: 4700 },
    { key: "sodium", name: "Sodium", unit: "mg", usdaNumber: "307", dailyValue: 2300 },
    { key: "zinc", name: "Zinc", unit: "mg", usdaNumber: "309", dailyValue: 11 },
    { key: "copper", name: "Copper", unit: "mg", usdaNumber: "312", dailyValue: 0.9 },
    { key: "manganese", name: "Manganese", unit: "mg", usdaNumber: "315", dailyValue: 2.3 },
    { key: "selenium", name: "Selenium", unit: "mcg", usdaNumber: "317", dailyValue: 55 },
    { key: "iodine", name: "Iodine", unit: "mcg", dailyValue: 150 },
    { key: "chromium", name: "Chromium", unit: "mcg", dailyValue: 35 },
    { key: "molybdenum", name: "Molybdenum", unit: "mcg", dailyValue: 45 },
  ]),
  ...group("other", [
    { key: "water", name: "Water", unit: "g", usdaNumber: "255" },
    { key: "caffeine", name: "Caffeine", unit: "mg", usdaNumber: "262" },
    { key: "alcohol", name: "Alcohol", unit: "g", usdaNumber: "221" },
  ]),
];

export const NUTRIENT_KEYS: readonly string[] = NUTRIENT_CATALOG.map((n) => n.key);
