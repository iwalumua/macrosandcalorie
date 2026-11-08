import type { Database } from "./client";
import { NUTRIENT_CATALOG } from "./nutrient-catalog";
import { getDailyTotals, getDiaryDay, getTargetOverrides, type DailyTotals, type DiaryDay } from "./queries";
import { buildDaySummary, type DaySummary } from "../lib/summary";
import { resolveTargets, type ResolvedTarget } from "../lib/targets";

export interface LoadedDay {
  day: DiaryDay;
  totals: DailyTotals;
  targets: Record<string, ResolvedTarget>;
  summary: DaySummary;
}

/**
 * Load everything for one local calendar day and build its summary. The diary
 * page and the Day Summary page share this so they can never disagree.
 */
export async function loadDay(db: Database, userId: string, date: string): Promise<LoadedDay> {
  const [day, totals, overrides] = await Promise.all([
    getDiaryDay(db, userId, date),
    getDailyTotals(db, userId, date),
    getTargetOverrides(db, userId),
  ]);
  const targets = resolveTargets(NUTRIENT_CATALOG, overrides);
  const summary = buildDaySummary({
    date,
    complete: day.complete,
    catalog: NUTRIENT_CATALOG,
    targets,
    totals,
    entries: day.entries.map((e) => ({ meal: e.meal, amounts: e.amounts })),
    exercise: day.exercise,
  });
  return { day, totals, targets, summary };
}
