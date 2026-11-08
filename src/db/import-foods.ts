import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "./client";
import { nutrientIds } from "./mutations";
import { foodNutrients, foods, foodServings } from "./schema";
import type { ImportedFood } from "../lib/food-import";

export interface UpsertResult {
  inserted: number;
  updated: number;
  nutrientRows: number;
  servingsInserted: number;
  servingsUpdated: number;
}

/** Postgres allows 65,535 parameters in one statement; stay well under it. */
const ROWS_PER_INSERT = 4000;

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Store foods from an outside database. Safe to run again: foods are matched by
 * (source, source id), so a second run updates instead of duplicating.
 *
 * What a re-run does to existing data:
 * - A food's name, brand and barcode are updated.
 * - Its nutrient amounts are replaced, so corrections in the source reach history.
 * - Servings are NEVER deleted. Diary entries reference a serving with
 *   ON DELETE SET NULL, so deleting one would silently turn "2 x 1 cup" into
 *   "2 grams". Existing servings are matched by label and have their weight
 *   updated; new labels are added; the default is only chosen when none exists.
 */
export async function upsertImportedFoods(
  db: Database,
  items: readonly ImportedFood[],
  options: { batchSize?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<UpsertResult> {
  const result: UpsertResult = { inserted: 0, updated: 0, nutrientRows: 0, servingsInserted: 0, servingsUpdated: 0 };
  if (items.length === 0) return result;
  const ids = await nutrientIds(db);
  let done = 0;

  for (const batch of chunks(items, options.batchSize ?? 500)) {
    await db.transaction(async (tx) => {
      // 1. The foods themselves. `xmax = 0` is true only for rows that were just inserted.
      const rows = await tx
        .insert(foods)
        .values(
          batch.map((f) => ({
            name: f.name,
            brand: f.brand,
            barcode: f.barcode,
            dataset: f.dataset ?? null,
            source: f.source,
            sourceId: f.sourceId,
            ownerId: null,
          })),
        )
        .onConflictDoUpdate({
          target: [foods.source, foods.sourceId],
          targetWhere: sql`${foods.sourceId} is not null`,
          set: {
            name: sql`excluded.name`,
            brand: sql`excluded.brand`,
            barcode: sql`excluded.barcode`,
            dataset: sql`excluded.dataset`,
            updatedAt: sql`now()`,
          },
        })
        .returning({ id: foods.id, sourceId: foods.sourceId, inserted: sql<boolean>`(xmax = 0)` });

      const idOf = new Map(rows.map((r) => [r.sourceId!, r.id]));
      for (const r of rows) r.inserted ? result.inserted++ : result.updated++;
      const foodIds = [...idOf.values()];

      // 2. Nutrients: replace.
      await tx.delete(foodNutrients).where(inArray(foodNutrients.foodId, foodIds));
      const nutrientValues = batch.flatMap((f) =>
        Object.entries(f.per100g).flatMap(([key, amount]) => {
          const nutrientId = ids.get(key);
          return nutrientId === undefined ? [] : [{ foodId: idOf.get(f.sourceId)!, nutrientId, amountPer100g: amount }];
        }),
      );
      for (const part of chunks(nutrientValues, ROWS_PER_INSERT)) await tx.insert(foodNutrients).values(part);
      result.nutrientRows += nutrientValues.length;

      // 3. Servings: add and update, never delete.
      const existing = await tx
        .select({ id: foodServings.id, foodId: foodServings.foodId, label: foodServings.label, grams: foodServings.grams, isDefault: foodServings.isDefault })
        .from(foodServings)
        .where(inArray(foodServings.foodId, foodIds));
      const byFood = new Map<string, typeof existing>();
      for (const e of existing) byFood.set(e.foodId, [...(byFood.get(e.foodId) ?? []), e]);

      const toInsert: { foodId: string; label: string; grams: number; isDefault: boolean }[] = [];
      for (const f of batch) {
        const foodId = idOf.get(f.sourceId)!;
        const have = byFood.get(foodId) ?? [];
        let hasDefault = have.some((h) => h.isDefault);
        for (const s of f.servings) {
          const match = have.find((h) => h.label === s.label);
          if (match) {
            if (match.grams !== s.grams) {
              await tx.update(foodServings).set({ grams: s.grams }).where(and(eq(foodServings.id, match.id), eq(foodServings.foodId, foodId)));
              result.servingsUpdated++;
            }
          } else {
            toInsert.push({ foodId, label: s.label, grams: s.grams, isDefault: !hasDefault });
            hasDefault = true;
          }
        }
      }
      for (const part of chunks(toInsert, ROWS_PER_INSERT)) await tx.insert(foodServings).values(part);
      result.servingsInserted += toInsert.length;
    });
    done += batch.length;
    options.onProgress?.(done, items.length);
  }
  return result;
}
