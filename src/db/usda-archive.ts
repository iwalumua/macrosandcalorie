import { strFromU8, unzipSync } from "fflate";
import type { UsdaFiles } from "../lib/usda";

/** The CSV files inside a USDA archive that the importer reads, and the field each fills. */
const REQUIRED: Record<keyof UsdaFiles, string> = {
  food: "food.csv",
  foodNutrient: "food_nutrient.csv",
  nutrient: "nutrient.csv",
  foodPortion: "food_portion.csv",
  measureUnit: "measure_unit.csv",
};

/**
 * Read the files the importer needs out of a USDA zip, in memory (nothing is
 * written to disk, so a hostile archive cannot place files anywhere). Fails with
 * a clear message if the archive is not what we expect, which does happen: the
 * 2026-10-29 Foundation release shipped without food.csv and food_nutrient.csv.
 */
export function readUsdaArchive(zip: Uint8Array): UsdaFiles {
  const wanted = new Set(Object.values(REQUIRED));
  const entries = unzipSync(zip, {
    filter: (f) => wanted.has(f.name.split("/").pop() ?? ""),
  });
  const byName = new Map(Object.entries(entries).map(([name, data]) => [name.split("/").pop()!, data]));

  const missing = Object.values(REQUIRED).filter((name) => !byName.has(name));
  if (missing.length > 0) {
    throw new Error(
      `This USDA archive is missing ${missing.join(", ")}, so it cannot be imported. ` +
        "USDA has published incomplete archives before; pick a different release (see USDA_DATASETS in src/lib/usda.ts).",
    );
  }
  return Object.fromEntries(
    (Object.entries(REQUIRED) as [keyof UsdaFiles, string][]).map(([field, name]) => [field, strFromU8(byName.get(name)!)]),
  ) as unknown as UsdaFiles;
}

/**
 * Why a fetch failed. Node reports only "fetch failed" and keeps the real reason
 * (ENOTFOUND, ECONNREFUSED, a timeout...) in `error.cause`.
 */
export function describeFetchError(error: unknown): string {
  const cause = (error as { cause?: { code?: string; message?: string } })?.cause;
  const reason = cause?.code ?? cause?.message ?? (error as Error)?.message ?? "unknown error";
  return String(reason);
}

/**
 * Download an archive. Throws with the HTTP status, or the real network error,
 * on failure. Node's fetch ignores HTTP(S)_PROXY unless NODE_USE_ENV_PROXY=1 is set.
 */
export async function downloadArchive(url: string): Promise<Uint8Array> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  } catch (e) {
    throw new Error(`Could not download ${url} (${describeFetchError(e)}). Behind a proxy? Set NODE_USE_ENV_PROXY=1 and HTTPS_PROXY.`);
  }
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} for ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}
