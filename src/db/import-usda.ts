import { readFile } from "node:fs/promises";
import { createDb } from "./client";
import { upsertImportedFoods } from "./import-foods";
import { NUTRIENT_CATALOG } from "./nutrient-catalog";
import { downloadArchive, readUsdaArchive } from "./usda-archive";
import { buildUsdaFoods, USDA_DATASETS, type UsdaDatasetKey } from "../lib/usda";

/**
 * Import USDA FoodData Central foods. Run with `npm run db:import:usda`.
 *
 *   npm run db:import:usda                          both curated datasets
 *   npm run db:import:usda -- --dataset foundation  one dataset
 *   npm run db:import:usda -- --dataset sr_legacy --file C:\path\to\sr_legacy.zip
 *   npm run db:import:usda -- --dry-run             parse and report, write nothing
 *
 * Safe to run again. Data: USDA FoodData Central, public domain (CC0 1.0).
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : (process.argv[i + 1] ?? "");
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const which = arg("dataset") ?? "all";
  const keys = (which === "all" ? Object.keys(USDA_DATASETS) : [which]) as UsdaDatasetKey[];
  for (const k of keys) {
    if (!(k in USDA_DATASETS)) throw new Error(`Unknown dataset "${k}". Choose: ${Object.keys(USDA_DATASETS).join(", ")}, all.`);
  }
  const file = arg("file");
  if (file && keys.length !== 1) throw new Error("--file needs a single --dataset (the file is one dataset's zip).");
  const dryRun = flag("dry-run");

  const handle = dryRun ? null : createDb();
  try {
    for (const key of keys) {
      const ds = USDA_DATASETS[key];
      console.log(`\n== ${ds.label}`);
      let zip: Uint8Array;
      if (file) {
        console.log(`Reading ${file}`);
        zip = new Uint8Array(await readFile(file));
      } else {
        console.log(`Downloading ${ds.url}`);
        try {
          zip = await downloadArchive(ds.url);
        } catch (e) {
          throw new Error(`${(e as Error).message}\nOr download the zip in a browser and pass --file.`);
        }
      }
      console.log(`Got ${(zip.byteLength / 1048576).toFixed(1)} MB`);

      const { foods, report } = buildUsdaFoods(readUsdaArchive(zip), { dataTypes: ds.dataTypes, catalog: NUTRIENT_CATALOG, dataset: key });
      console.log(
        `Foods in file: ${report.foodRows}; real foods (${ds.dataTypes.join(", ")}): ${report.wantedFoods}; importing: ${report.imported}\n` +
          `  nutrient values: ${report.nutrientValues}; portions: ${report.servings}\n` +
          `  energy from Atwater values: ${report.energyFromAtwater}; estimated from macros: ${report.energyEstimated}\n` +
          `  skipped, no energy value and no macros: ${report.skippedNoEnergy}\n` +
          `  skipped (no usable nutrients): ${report.skippedNoNutrients}\n` +
          `  ignored rows by type: ${JSON.stringify(report.ignoredByType)}`,
      );

      if (handle) {
        const r = await upsertImportedFoods(handle.db, foods, {
          onProgress: (done, total) => process.stdout.write(`\r  writing ${done}/${total}`),
        });
        console.log(
          `\n  foods added: ${r.inserted}, updated: ${r.updated}; nutrient rows: ${r.nutrientRows}; ` +
            `servings added: ${r.servingsInserted}, updated: ${r.servingsUpdated}`,
        );
      } else {
        console.log("  (dry run: nothing written)");
      }
    }
  } finally {
    await handle?.close();
  }
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
