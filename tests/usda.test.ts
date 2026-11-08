import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { readUsdaArchive } from "../src/db/usda-archive";
import type { NutrientDef } from "../src/db/nutrient-catalog";
import { buildUsdaFoods, portionLabel, verifyNutrientMapping, type UsdaFiles } from "../src/lib/usda";

/*
 * Synthetic USDA-shaped files. Names are "Test ..." and every amount is a round
 * number: none of this is real nutrition data. The structure mirrors what the
 * real downloads look like (quoted fields, nutrient numbers, the placeholder
 * unit "undetermined", portion text in `modifier`).
 */
const CATALOG: NutrientDef[] = [
  { key: "energy_kcal", name: "Energy", unit: "kcal", category: "energy", usdaNumber: "208" },
  { key: "protein", name: "Protein", unit: "g", category: "macro", usdaNumber: "203" },
  { key: "carbs", name: "Carbohydrates", unit: "g", category: "macro", usdaNumber: "205" },
  { key: "fat", name: "Fat", unit: "g", category: "macro", usdaNumber: "204" },
  { key: "calcium", name: "Calcium", unit: "mg", category: "mineral", usdaNumber: "301" },
  { key: "vit_d", name: "Vitamin D", unit: "mcg", category: "vitamin", usdaNumber: "328" },
  { key: "water", name: "Water", unit: "g", category: "other" }, // no USDA number: never imported
];

const csv = (header: string[], ...rows: (string | number)[][]) =>
  [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n") + "\n";

const NUTRIENT = csv(
  ["id", "name", "unit_name", "nutrient_nbr", "rank"],
  [1008, "Energy", "KCAL", "208", 300],
  [1003, "Protein", "G", "203", 600],
  [1005, "Carbohydrate, by difference", "G", "205", 1110],
  [1004, "Total lipid (fat)", "G", "204", 800],
  [1087, "Calcium, Ca", "MG", "301", 5300],
  [1114, "Vitamin D (D2 + D3)", "UG", "328", 8700],
  [2047, "Energy (Atwater General Factors)", "KCAL", "957", 280],
  [2048, "Energy (Atwater Specific Factors)", "KCAL", "958", 290],
  [1999, "Something we do not track", "G", "999", 1],
);

function files(over: Partial<UsdaFiles> = {}): UsdaFiles {
  return {
    nutrient: NUTRIENT,
    measureUnit: csv(["id", "name"], [9999, "undetermined"], [1000, "cup"]),
    food: csv(
      ["fdc_id", "data_type", "description", "food_category_id", "publication_date"],
      [100, "foundation_food", "Test Oat Flour", 20, "2026-01-01"],
      [101, "foundation_food", "Test Atwater Only", 20, "2026-01-01"],
      [102, "foundation_food", "Test Specific Beats General", 20, "2026-01-01"],
      [103, "foundation_food", "Test Macros Only", 20, "2026-01-01"],
      [104, "foundation_food", "Test Vitamins Only", 20, "2026-01-01"],
      [105, "foundation_food", "Test Nothing", 20, "2026-01-01"],
      [200, "sub_sample_food", "Test Lab Sample", 20, "2026-01-01"],
      [201, "market_acquisition", "Test Market Sample", 20, "2026-01-01"],
    ),
    foodNutrient: csv(
      ["id", "fdc_id", "nutrient_id", "amount"],
      [1, 100, 1008, 400],
      [2, 100, 1003, 10],
      [3, 100, 1005, 80],
      [4, 100, 1004, 2],
      [5, 100, 1087, 30],
      [6, 100, 1114, 0], // an explicit zero is real data
      [7, 100, 1999, 5], // untracked nutrient: ignored
      [8, 101, 2047, 300], // no 208: falls back to Atwater
      [9, 101, 1003, 5],
      [10, 102, 2047, 300],
      [11, 102, 2048, 350], // specific beats general
      [12, 103, 1003, 10], // no energy anywhere: estimated 10*4 + 20*4 + 5*9
      [13, 103, 1005, 20],
      [14, 103, 1004, 5],
      [15, 104, 1087, 40], // vitamins but no energy and no macros: skipped
      [16, 200, 1008, 99], // lab sample: wrong data type
      [17, 201, 1008, 99],
    ),
    foodPortion: csv(
      ["id", "fdc_id", "seq_num", "amount", "measure_unit_id", "portion_description", "modifier", "gram_weight"],
      [1, 100, 2, 1, 9999, "", "slice", 30],
      [2, 100, 1, 1, 1000, "", "sifted", 120],
      [3, 100, 3, 0.5, 1000, "half cup, packed", "", 60],
      [4, 100, 4, 1, 9999, "", "slice", 31], // same label again: first one wins
      [5, 100, 5, 1, 9999, "", "pinch", 0], // zero weight: ignored
      [6, 101, 1, "", 9999, "", "", 50], // no amount, no text
    ),
    ...over,
  };
}

const build = (f = files()) => buildUsdaFoods(f, { dataTypes: ["foundation_food"], catalog: CATALOG });
const byName = (foods: ReturnType<typeof build>["foods"], name: string) => foods.find((f) => f.name === name)!;

describe("buildUsdaFoods", () => {
  it("imports only the requested data type, not the lab samples", () => {
    const { foods, report } = build();
    expect(foods.map((f) => f.sourceId)).not.toContain("200");
    expect(foods.map((f) => f.sourceId)).not.toContain("201");
    expect(report.foodRows).toBe(8);
    expect(report.wantedFoods).toBe(6);
    expect(report.ignoredByType).toEqual({ sub_sample_food: 1, market_acquisition: 1 });
  });

  it("maps USDA numbers to catalogue keys and keeps explicit zeros", () => {
    const flour = byName(build().foods, "Test Oat Flour");
    expect(flour).toMatchObject({ source: "usda", sourceId: "100", brand: null, barcode: null });
    expect(flour.per100g).toEqual({ energy_kcal: 400, protein: 10, carbs: 80, fat: 2, calcium: 30, vit_d: 0 });
  });

  it("falls back to Atwater energy, preferring the specific over the general factors", () => {
    const { foods, report } = build();
    expect(byName(foods, "Test Atwater Only").per100g.energy_kcal).toBe(300);
    expect(byName(foods, "Test Specific Beats General").per100g.energy_kcal).toBe(350);
    expect(report.energyFromAtwater).toBe(2);
  });

  it("estimates energy from macros when only macros are known", () => {
    const { foods, report } = build();
    expect(byName(foods, "Test Macros Only").per100g.energy_kcal).toBe(10 * 4 + 20 * 4 + 5 * 9);
    expect(report.energyEstimated).toBe(1);
  });

  it("skips foods with no energy and no macros instead of importing them as 0 kcal", () => {
    const { foods, report } = build();
    expect(foods.map((f) => f.name)).not.toContain("Test Vitamins Only");
    expect(report.skippedNoEnergy).toBe(1);
  });

  it("skips foods with no tracked nutrient at all", () => {
    const { foods, report } = build();
    expect(foods.map((f) => f.name)).not.toContain("Test Nothing");
    expect(report.skippedNoNutrients).toBe(1);
    expect(report.imported).toBe(foods.length);
  });

  it("ignores blank, negative and non-numeric amounts", () => {
    const f = files({
      foodNutrient: csv(
        ["id", "fdc_id", "nutrient_id", "amount"],
        [1, 100, 1008, 400],
        [2, 100, 1003, ""],
        [3, 100, 1005, -5],
        [4, 100, 1004, "n/a"],
      ),
    });
    const flour = byName(build(f).foods, "Test Oat Flour");
    expect(flour.per100g).toEqual({ energy_kcal: 400 });
  });

  it("builds portion labels from the modifier, orders by USDA's sequence and drops duplicates and zero weights", () => {
    const flour = byName(build().foods, "Test Oat Flour");
    expect(flour.servings).toEqual([
      { label: "1 cup sifted", grams: 120 }, // named unit + modifier
      { label: "1 slice", grams: 30 },
      { label: "0.5 cup half cup, packed", grams: 60 },
    ]);
  });

  it("gives a portion with no text a neutral label", () => {
    expect(byName(build().foods, "Test Atwater Only").servings).toEqual([{ label: "1 portion", grams: 50 }]);
  });

  it("refuses to import when the catalogue mapping disagrees with the dataset", () => {
    const wrongUnit = NUTRIENT.replace('"Calcium, Ca","MG"', '"Calcium, Ca","G"');
    expect(() => build(files({ nutrient: wrongUnit }))).toThrow(/refusing to import[\s\S]*calcium/);
    const missing = NUTRIENT.replace('"328"', '"329"');
    expect(() => build(files({ nutrient: missing }))).toThrow(/refusing to import[\s\S]*vit_d/);
  });
});

describe("verifyNutrientMapping", () => {
  it("passes when every mapped number exists with the right unit", () => {
    expect(verifyNutrientMapping(NUTRIENT, CATALOG)).toEqual([]);
  });

  it("reports a missing number and a unit mismatch, by catalogue key", () => {
    const bad = csv(["id", "name", "unit_name", "nutrient_nbr", "rank"], [1008, "Energy", "KJ", "208", 1], [1003, "Protein", "G", "203", 1]);
    const problems = verifyNutrientMapping(bad, CATALOG);
    expect(problems.find((p) => p.key === "energy_kcal")?.problem).toMatch(/in kJ|in KJ/i);
    expect(problems.find((p) => p.key === "carbs")?.problem).toMatch(/does not exist/);
  });

  it("flags Atwater energy in the wrong unit", () => {
    const bad = NUTRIENT.replace('"Energy (Atwater General Factors)","KCAL"', '"Energy (Atwater General Factors)","KJ"');
    expect(verifyNutrientMapping(bad, CATALOG).some((p) => p.problem.includes("957"))).toBe(true);
  });
});

describe("portionLabel", () => {
  it("drops the placeholder unit and formats the amount", () => {
    expect(portionLabel("1", "undetermined", "cup, chopped")).toBe("1 cup, chopped");
    expect(portionLabel("1.0", "undetermined", "slice")).toBe("1 slice");
    expect(portionLabel("0.25", "cup", "")).toBe("0.25 cup");
    expect(portionLabel("2", "tbsp", "level")).toBe("2 tbsp level");
    expect(portionLabel("", "undetermined", "")).toBe("1 portion");
    expect(portionLabel("abc", "undetermined", "bar")).toBe("1 bar");
  });
});

describe("readUsdaArchive", () => {
  const archive = (names: string[], folder = "FoodData_Central_test/") =>
    zipSync(Object.fromEntries(names.map((n) => [folder + n, strToU8(`"id"\n"${n}"\n`)])));
  const ALL = ["food.csv", "food_nutrient.csv", "nutrient.csv", "food_portion.csv", "measure_unit.csv"];

  it("reads the files it needs, wherever they sit in the archive, ignoring the rest", () => {
    const f = readUsdaArchive(archive([...ALL, "sub_sample_result.csv", "lab_method.csv"]));
    expect(Object.keys(f).sort()).toEqual(["food", "foodNutrient", "foodPortion", "measureUnit", "nutrient"]);
    expect(f.food).toContain("food.csv");
    const flat = readUsdaArchive(archive(ALL, ""));
    expect(flat.nutrient).toContain("nutrient.csv");
  });

  it("refuses an incomplete archive and names what is missing (the real 2026-10-29 Foundation release)", () => {
    expect(() => readUsdaArchive(archive(["nutrient.csv", "measure_unit.csv", "foundation_food.csv"]))).toThrow(
      /missing food\.csv, food_nutrient\.csv, food_portion\.csv/,
    );
  });

  it("does not touch the filesystem, even for hostile entry names", () => {
    const hostile = zipSync({ "../../evil.csv": strToU8("x"), ...Object.fromEntries(ALL.map((n) => [n, strToU8(`"id"\n"1"\n`)])) });
    expect(() => readUsdaArchive(hostile)).not.toThrow(); // read in memory; nothing is written anywhere
  });
});
