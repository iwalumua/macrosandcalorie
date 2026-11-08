/**
 * The nutrients the app can track. This is the single source of truth: the
 * seed script upserts it into the `nutrients` table, and the domain code in
 * src/lib refers to nutrients by `key`.
 *
 * - Amounts are stored per 100 g (foods) or per serving (supplements) in `unit`.
 * - `dailyValue` is the FDA adult Daily Value used on US nutrition labels
 *   (2020 labelling rules). It is a *generic* reference, not a personalised
 *   target. Personalised DRIs by age/sex are on the roadmap (docs/PRODUCT.md).
 * - `direction` says how to read `dailyValue` (reach it, stay under it, or a
 *   budget the user sets). `upperLimit` is an adult Tolerable Upper Intake
 *   Level. Neither is stored in the database; the summary code reads them from
 *   here, so changing them needs no migration.
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

/**
 * How to read a nutrient's reference value:
 * - `goal`: aim to reach it; more is fine (fiber, vitamins, minerals, protein).
 * - `limit`: aim to stay under it (sodium, added sugars, saturated fat).
 * - `budget`: a figure the user sets for the day (calories, carbs, fat), judged
 *   by closeness rather than "more is better".
 */
export type NutrientDirection = "goal" | "limit" | "budget";

/**
 * What an upper limit is compared against:
 * - `total`: food + supplements together.
 * - `supplements`: supplements only. Some limits (magnesium, niacin, vitamin E)
 *   are defined for supplemental intake, so food must not count toward them.
 */
export type UpperLimitScope = "total" | "supplements";

export interface NutrientDef {
  key: string;
  name: string;
  unit: NutrientUnit;
  category: NutrientCategory;
  usdaNumber?: string;
  dailyValue?: number;
  /** Defaults to `goal`. */
  direction?: NutrientDirection;
  /** Adult (19+) Tolerable Upper Intake Level, in `unit`. Absent where none is established. */
  upperLimit?: number;
  /** Defaults to `total`. */
  upperLimitScope?: UpperLimitScope;
}

function group(
  category: NutrientCategory,
  items: Omit<NutrientDef, "category">[],
): NutrientDef[] {
  return items.map((item) => ({ ...item, category }));
}

/*
 * Upper limits are the NIH Office of Dietary Supplements / IOM Tolerable Upper
 * Intake Levels for adults 19+. They are general reference points, not medical
 * advice. Deliberately NOT included, because this data model cannot apply them
 * correctly:
 * - Vitamin A: the limit is for preformed vitamin A (retinol) only, but the
 *   tracked value is total RAE, which includes carotenoids that have no limit.
 * - Folate: the limit is for synthetic folic acid, but the tracked value is DFE.
 * - Phosphorus: age-dependent. Calcium is also age-dependent (2,000 mg from age
 *   51); the adult 19-50 figure is used until personalised reference intakes
 *   exist.
 */
export const NUTRIENT_CATALOG: readonly NutrientDef[] = [
  ...group("energy", [
    {
      key: "energy_kcal",
      name: "Energy",
      unit: "kcal",
      usdaNumber: "208",
      dailyValue: 2000,
      direction: "budget",
    },
  ]),
  ...group("macro", [
    { key: "protein", name: "Protein", unit: "g", usdaNumber: "203", dailyValue: 50 },
    {
      key: "carbs",
      name: "Carbohydrates",
      unit: "g",
      usdaNumber: "205",
      dailyValue: 275,
      direction: "budget",
    },
    { key: "fiber", name: "Fiber", unit: "g", usdaNumber: "291", dailyValue: 28 },
    { key: "sugars", name: "Sugars", unit: "g", usdaNumber: "269" },
    { key: "added_sugars", name: "Added Sugars", unit: "g", dailyValue: 50, direction: "limit" },
    {
      key: "fat",
      name: "Fat",
      unit: "g",
      usdaNumber: "204",
      dailyValue: 78,
      direction: "budget",
    },
  ]),
  ...group("lipid", [
    {
      key: "sat_fat",
      name: "Saturated Fat",
      unit: "g",
      usdaNumber: "606",
      dailyValue: 20,
      direction: "limit",
    },
    { key: "mono_fat", name: "Monounsaturated Fat", unit: "g", usdaNumber: "645" },
    { key: "poly_fat", name: "Polyunsaturated Fat", unit: "g", usdaNumber: "646" },
    { key: "trans_fat", name: "Trans Fat", unit: "g", usdaNumber: "605" },
    {
      key: "cholesterol",
      name: "Cholesterol",
      unit: "mg",
      usdaNumber: "601",
      dailyValue: 300,
      direction: "limit",
    },
    { key: "omega3_ala", name: "Omega-3 ALA", unit: "g", usdaNumber: "851" },
    { key: "omega3_epa", name: "Omega-3 EPA", unit: "g", usdaNumber: "629" },
    { key: "omega3_dha", name: "Omega-3 DHA", unit: "g", usdaNumber: "621" },
  ]),
  ...group("vitamin", [
    { key: "vit_a", name: "Vitamin A (RAE)", unit: "mcg", usdaNumber: "320", dailyValue: 900 },
    { key: "vit_c", name: "Vitamin C", unit: "mg", usdaNumber: "401", dailyValue: 90, upperLimit: 2000 },
    { key: "vit_d", name: "Vitamin D", unit: "mcg", usdaNumber: "328", dailyValue: 20, upperLimit: 100 },
    {
      key: "vit_e",
      name: "Vitamin E",
      unit: "mg",
      usdaNumber: "323",
      dailyValue: 15,
      upperLimit: 1000,
      upperLimitScope: "supplements",
    },
    { key: "vit_k", name: "Vitamin K", unit: "mcg", usdaNumber: "430", dailyValue: 120 },
    { key: "thiamin", name: "Thiamin (B1)", unit: "mg", usdaNumber: "404", dailyValue: 1.2 },
    { key: "riboflavin", name: "Riboflavin (B2)", unit: "mg", usdaNumber: "405", dailyValue: 1.3 },
    {
      key: "niacin",
      name: "Niacin (B3)",
      unit: "mg",
      usdaNumber: "406",
      dailyValue: 16,
      upperLimit: 35,
      upperLimitScope: "supplements",
    },
    { key: "pantothenic_acid", name: "Pantothenic Acid (B5)", unit: "mg", usdaNumber: "410", dailyValue: 5 },
    { key: "vit_b6", name: "Vitamin B6", unit: "mg", usdaNumber: "415", dailyValue: 1.7, upperLimit: 100 },
    { key: "biotin", name: "Biotin (B7)", unit: "mcg", usdaNumber: "416", dailyValue: 30 },
    { key: "folate", name: "Folate (DFE)", unit: "mcg", usdaNumber: "435", dailyValue: 400 },
    { key: "vit_b12", name: "Vitamin B12", unit: "mcg", usdaNumber: "418", dailyValue: 2.4 },
    { key: "choline", name: "Choline", unit: "mg", usdaNumber: "421", dailyValue: 550, upperLimit: 3500 },
  ]),
  ...group("mineral", [
    { key: "calcium", name: "Calcium", unit: "mg", usdaNumber: "301", dailyValue: 1300, upperLimit: 2500 },
    { key: "iron", name: "Iron", unit: "mg", usdaNumber: "303", dailyValue: 18, upperLimit: 45 },
    {
      key: "magnesium",
      name: "Magnesium",
      unit: "mg",
      usdaNumber: "304",
      dailyValue: 420,
      upperLimit: 350,
      upperLimitScope: "supplements",
    },
    { key: "phosphorus", name: "Phosphorus", unit: "mg", usdaNumber: "305", dailyValue: 1250 },
    { key: "potassium", name: "Potassium", unit: "mg", usdaNumber: "306", dailyValue: 4700 },
    {
      key: "sodium",
      name: "Sodium",
      unit: "mg",
      usdaNumber: "307",
      dailyValue: 2300,
      direction: "limit",
    },
    { key: "zinc", name: "Zinc", unit: "mg", usdaNumber: "309", dailyValue: 11, upperLimit: 40 },
    { key: "copper", name: "Copper", unit: "mg", usdaNumber: "312", dailyValue: 0.9, upperLimit: 10 },
    { key: "manganese", name: "Manganese", unit: "mg", usdaNumber: "315", dailyValue: 2.3, upperLimit: 11 },
    { key: "selenium", name: "Selenium", unit: "mcg", usdaNumber: "317", dailyValue: 55, upperLimit: 400 },
    { key: "iodine", name: "Iodine", unit: "mcg", dailyValue: 150, upperLimit: 1100 },
    { key: "chromium", name: "Chromium", unit: "mcg", dailyValue: 35 },
    { key: "molybdenum", name: "Molybdenum", unit: "mcg", dailyValue: 45, upperLimit: 2000 },
  ]),
  ...group("other", [
    { key: "water", name: "Water", unit: "g", usdaNumber: "255" },
    { key: "caffeine", name: "Caffeine", unit: "mg", usdaNumber: "262" },
    { key: "alcohol", name: "Alcohol", unit: "g", usdaNumber: "221" },
  ]),
];

export const NUTRIENT_KEYS: readonly string[] = NUTRIENT_CATALOG.map((n) => n.key);
