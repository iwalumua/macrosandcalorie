/**
 * Turns USDA FoodData Central CSV files into foods the app can store. Pure:
 * CSV text in, foods out, no network and no database, so it is unit tested
 * with small synthetic files.
 *
 * Things about the real data that this code exists to handle (each was
 * observed in the actual downloads, not assumed):
 * - Foundation's food.csv has ~88,000 rows but only ~470 are real foods
 *   (`foundation_food`); the rest are lab samples with ~2 nutrients each. Only
 *   the data types asked for are imported.
 * - Most Foundation foods have no standard energy value (nutrient 208), only
 *   Atwater energy (958 specific, 957 general). Energy falls back 208 -> 958 -> 957.
 * - Portion descriptions live in `modifier` ("cup, chopped"); the measure unit
 *   is usually the placeholder "undetermined".
 */

import type { NutrientDef } from "../db/nutrient-catalog";
import { csvRecords } from "./csv";
import { estimateEnergyKcal, type ImportedFood, type ImportedServing } from "./food-import";

export interface UsdaFiles {
  food: string;
  foodNutrient: string;
  nutrient: string;
  foodPortion: string;
  measureUnit: string;
}

/** A dataset to import: pinned to one release on purpose, never "latest". */
export interface UsdaDataset {
  label: string;
  url: string;
  /** Which `food.csv` data_type values are real foods. */
  dataTypes: string[];
}

/**
 * Pinned releases. The newest Foundation archive (2026-10-29) was observed to be
 * missing food.csv and food_nutrient.csv, so "download the latest" is unsafe;
 * archives are validated before use (see readUsdaArchive).
 */
export const USDA_DATASETS = {
  sr_legacy: {
    label: "SR Legacy (April 2018)",
    url: "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip",
    dataTypes: ["sr_legacy_food"],
  },
  foundation: {
    label: "Foundation Foods (April 2026)",
    url: "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2026-04-30.zip",
    dataTypes: ["foundation_food"],
  },
} as const satisfies Record<string, UsdaDataset>;

export type UsdaDatasetKey = keyof typeof USDA_DATASETS;

/** FDC's unit names mapped to the catalogue's. */
const UNIT: Record<string, string> = { G: "g", MG: "mg", UG: "mcg", KCAL: "kcal", IU: "IU" };

const ENERGY_NBR = "208";
/** Used only when a food has no 208, in this order. */
const ENERGY_FALLBACK_NBRS = ["958", "957"] as const;

export interface MappingProblem {
  key: string;
  problem: string;
}

/**
 * Check every catalogue `usdaNumber` against the dataset's own nutrient.csv:
 * the number must exist and its unit must match the catalogue's. The importer
 * refuses to run if anything is wrong, so a USDA renumbering or unit change
 * cannot quietly store wrong values.
 */
export function verifyNutrientMapping(
  nutrientCsv: string,
  catalog: readonly NutrientDef[],
): MappingProblem[] {
  const byNbr = new Map<string, { unit: string; name: string }>();
  for (const r of csvRecords(nutrientCsv)) {
    byNbr.set(r.nutrient_nbr ?? "", { unit: UNIT[(r.unit_name ?? "").toUpperCase()] ?? r.unit_name ?? "", name: r.name ?? "" });
  }
  const problems: MappingProblem[] = [];
  for (const n of catalog) {
    if (!n.usdaNumber) continue;
    const found = byNbr.get(n.usdaNumber);
    if (!found) {
      problems.push({ key: n.key, problem: `USDA nutrient number ${n.usdaNumber} does not exist in nutrient.csv` });
    } else if (found.unit !== n.unit) {
      problems.push({
        key: n.key,
        problem: `USDA nutrient ${n.usdaNumber} "${found.name}" is in ${found.unit}, the catalogue expects ${n.unit}`,
      });
    }
  }
  for (const nbr of ENERGY_FALLBACK_NBRS) {
    const f = byNbr.get(nbr);
    if (f && f.unit !== "kcal") problems.push({ key: "energy_kcal", problem: `Atwater energy ${nbr} is in ${f.unit}, expected kcal` });
  }
  return problems;
}

/** "1 cup, chopped", "1 slice", "0.5 bar". The placeholder unit "undetermined" is dropped. */
export function portionLabel(amount: string, unitName: string, description: string): string {
  const a = Number(amount);
  const qty = Number.isFinite(a) && a > 0 ? String(a) : "1";
  const unit = unitName.trim().toLowerCase() === "undetermined" ? "" : unitName.trim();
  const text = [qty, unit, description.trim()].filter(Boolean).join(" ");
  return text === qty ? `${qty} portion` : text;
}

export interface BuildReport {
  /** Rows in food.csv, of every data type. */
  foodRows: number;
  /** Rows of the requested data types. */
  wantedFoods: number;
  imported: number;
  /** Wanted foods with no mappable nutrient at all. */
  skippedNoNutrients: number;
  /** Foods whose energy came from Atwater values because 208 was absent. */
  energyFromAtwater: number;
  /** Foods with no energy value at all, estimated from macros. */
  energyEstimated: number;
  /**
   * Foods skipped because they have no energy value and no macros to estimate one
   * from. Logging them would silently count 0 kcal. (In the Foundation release these
   * are everyday foods such as olive oil and salt; SR Legacy carries them completely.)
   */
  skippedNoEnergy: number;
  /** Nutrient rows that will be stored (includes energy taken from Atwater values or estimated). */
  nutrientValues: number;
  servings: number;
  /** Food rows ignored because of their data type, by type. */
  ignoredByType: Record<string, number>;
}

export function buildUsdaFoods(
  files: UsdaFiles,
  options: { dataTypes: readonly string[]; catalog: readonly NutrientDef[]; dataset?: string },
): { foods: ImportedFood[]; report: BuildReport } {
  const problems = verifyNutrientMapping(files.nutrient, options.catalog);
  if (problems.length > 0) {
    throw new Error(
      "USDA nutrient mapping does not match this dataset; refusing to import:\n" +
        problems.map((p) => `  - ${p.key}: ${p.problem}`).join("\n"),
    );
  }

  // USDA nutrient id (the key used in food_nutrient.csv) -> catalogue key, plus the energy fallbacks.
  const nbrToKey = new Map(options.catalog.flatMap((n) => (n.usdaNumber ? [[n.usdaNumber, n.key] as const] : [])));
  const idToKey = new Map<string, string>();
  const idToAtwater = new Map<string, (typeof ENERGY_FALLBACK_NBRS)[number]>();
  for (const r of csvRecords(files.nutrient)) {
    const nbr = r.nutrient_nbr ?? "";
    const key = nbrToKey.get(nbr);
    if (key) idToKey.set(r.id ?? "", key);
    if ((ENERGY_FALLBACK_NBRS as readonly string[]).includes(nbr)) {
      idToAtwater.set(r.id ?? "", nbr as (typeof ENERGY_FALLBACK_NBRS)[number]);
    }
  }

  // Which foods to import.
  const wanted = new Map<string, string>(); // fdc_id -> description
  const ignoredByType: Record<string, number> = {};
  let foodRows = 0;
  const types = new Set(options.dataTypes);
  for (const r of csvRecords(files.food)) {
    foodRows++;
    if (types.has(r.data_type ?? "")) wanted.set(r.fdc_id ?? "", (r.description ?? "").trim());
    else ignoredByType[r.data_type ?? "?"] = (ignoredByType[r.data_type ?? "?"] ?? 0) + 1;
  }

  // Nutrient amounts per 100 g.
  const values = new Map<string, Record<string, number>>();
  const atwater = new Map<string, Partial<Record<"958" | "957", number>>>();
  for (const r of csvRecords(files.foodNutrient)) {
    const fdcId = r.fdc_id ?? "";
    if (!wanted.has(fdcId)) continue;
    const amount = Number(r.amount);
    if (r.amount === "" || !Number.isFinite(amount) || amount < 0) continue;
    const nid = r.nutrient_id ?? "";
    const key = idToKey.get(nid);
    if (key) {
      const m = values.get(fdcId) ?? {};
      m[key] = amount;
      values.set(fdcId, m);
      continue;
    }
    const nbr = idToAtwater.get(nid);
    if (nbr) {
      const a = atwater.get(fdcId) ?? {};
      a[nbr] = amount;
      atwater.set(fdcId, a);
    }
  }

  // Portions.
  const unitName = new Map<string, string>();
  for (const r of csvRecords(files.measureUnit)) unitName.set(r.id ?? "", r.name ?? "");
  const portions = new Map<string, { seq: number; serving: ImportedServing }[]>();
  for (const r of csvRecords(files.foodPortion)) {
    const fdcId = r.fdc_id ?? "";
    if (!wanted.has(fdcId)) continue;
    const grams = Number(r.gram_weight);
    if (!Number.isFinite(grams) || !(grams > 0)) continue;
    const seq = Number(r.seq_num);
    const label = portionLabel(r.amount ?? "", unitName.get(r.measure_unit_id ?? "") ?? "", r.portion_description || r.modifier || "");
    const list = portions.get(fdcId) ?? [];
    list.push({ seq: Number.isFinite(seq) ? seq : Number.MAX_SAFE_INTEGER, serving: { label, grams } });
    portions.set(fdcId, list);
  }

  const report: BuildReport = {
    foodRows,
    wantedFoods: wanted.size,
    imported: 0,
    skippedNoNutrients: 0,
    energyFromAtwater: 0,
    energyEstimated: 0,
    skippedNoEnergy: 0,
    nutrientValues: 0,
    servings: 0,
    ignoredByType,
  };

  const foods: ImportedFood[] = [];
  for (const [fdcId, name] of wanted) {
    const per100g = { ...(values.get(fdcId) ?? {}) };
    if (Object.keys(per100g).length === 0 && !atwater.has(fdcId)) {
      report.skippedNoNutrients++;
      continue;
    }
    if (per100g.energy_kcal === undefined) {
      const a = atwater.get(fdcId);
      const fallback = a?.["958"] ?? a?.["957"];
      if (fallback !== undefined) {
        per100g.energy_kcal = fallback;
        report.energyFromAtwater++;
      } else {
        const estimate = estimateEnergyKcal(per100g);
        if (estimate !== undefined) {
          per100g.energy_kcal = estimate;
          report.energyEstimated++;
        } else {
          report.skippedNoEnergy++;
          continue;
        }
      }
    }

    // Keep each label once (first wins), ordered by USDA's own sequence.
    const seen = new Set<string>();
    const servings = (portions.get(fdcId) ?? [])
      .sort((a, b) => a.seq - b.seq)
      .map((p) => p.serving)
      .filter((s) => (seen.has(s.label) ? false : (seen.add(s.label), true)));

    report.servings += servings.length;
    report.nutrientValues += Object.keys(per100g).length;
    foods.push({ source: "usda", sourceId: fdcId, name, brand: null, barcode: null, dataset: options.dataset ?? null, per100g, servings });
  }
  report.imported = foods.length;
  return { foods, report };
}
