import { NUTRIENT_CATALOG } from "../db/nutrient-catalog";
import type { NutrientAmounts } from "../lib/nutrition";
import { optionalNumber } from "./form";

/** Form field name for a nutrient's amount: `n_protein`, `n_vit_c`... */
export const nutrientField = (key: string) => `n_${key}`;

/**
 * Read every nutrient field on a label form. Blank fields are left out, so the
 * nutrient is stored as unknown rather than as zero.
 */
export function readNutrientFields(fd: FormData): NutrientAmounts {
  const out: NutrientAmounts = {};
  for (const n of NUTRIENT_CATALOG) {
    const v = optionalNumber(fd, nutrientField(n.key), n.name);
    if (v !== undefined) out[n.key] = v;
  }
  return out;
}
