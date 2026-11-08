/**
 * Builds the end-of-day summary: energy balance (eaten, exercise, net), macros,
 * every other nutrient against its target, and what went well or needs
 * attention. Pure: it takes plain data and returns plain data, so it is unit
 * tested without a database and can run on client or server.
 *
 * Three accuracy rules shape this file:
 * 1. A nutrient with *no data* is not the same as zero. A custom food entered
 *    from a label with only calories and macros reports nothing for vitamin C,
 *    which must not read as "0%, deficient". Such nutrients are `no_data`.
 * 2. Upper limits are checked against the right basis. Some (magnesium, niacin,
 *    vitamin E) apply to supplements only, so food must not count toward them.
 * 3. Energy and the macros are judged against a budget the user sets, not as
 *    "more is better", so they are reported separately from micronutrients.
 */

import type { NutrientDef, NutrientDirection, UpperLimitScope } from "../db/nutrient-catalog";
import { MEALS, type Meal } from "./meals";
import {
  KCAL_PER_GRAM,
  macroCalorieSplit,
  percentOfTarget,
  type NutrientAmounts,
} from "./nutrition";
import type { ResolvedTarget } from "./targets";

/** Reaching a goal nutrient: at or above this percent is "good". */
export const GOAL_MET_PERCENT = 100;
/** Goal nutrient at or above this (and under 100) is "near". */
export const GOAL_NEAR_PERCENT = 70;
/** Limit nutrient at or above this (and not over 100) is "near" the limit. */
export const LIMIT_NEAR_PERCENT = 90;
/** A budget nutrient within this many percentage points of 100 is "good". */
export const BUDGET_TOLERANCE_PERCENT = 10;

export const ENERGY_KEY = "energy_kcal";
export const MACRO_KEYS = ["protein", "carbs", "fat"] as const;
export type MacroKey = (typeof MACRO_KEYS)[number];

/**
 * - `good`: goal reached, limit respected, or budget within tolerance
 * - `near`: close to a goal (70-99%) or close to a limit (90-100%)
 * - `low`: well short of a goal, or under a budget
 * - `over`: above a limit or above a budget
 * - `no_target`: this nutrient has no target to compare with
 * - `no_data`: nothing logged reports this nutrient (unknown, not zero)
 */
export type NutrientStatus = "good" | "near" | "low" | "over" | "no_target" | "no_data";

export interface Classification {
  status: NutrientStatus;
  /** Amount as a percent of target (uncapped), or null when there is no target or no data. */
  percent: number | null;
}

/**
 * Slack for comparing percentages. Floating point makes `(0.09 / 0.1) * 100`
 * come out as 89.99999999999999, which would flip a value sitting exactly on a
 * boundary (90% of a limit, 110% of a budget) into the wrong band. Every
 * boundary below is inclusive, widened by this much.
 */
const EPSILON = 1e-9;

/** Judge one amount against one target. `amount` undefined means no data. */
export function classifyNutrient(
  direction: NutrientDirection,
  amount: number | undefined,
  target: number | null,
): Classification {
  if (target == null || !(target > 0)) return { status: "no_target", percent: null };
  if (amount === undefined) return { status: "no_data", percent: null };
  const percent = percentOfTarget(amount, target) ?? 0;

  switch (direction) {
    case "goal":
      if (percent >= GOAL_MET_PERCENT - EPSILON) return { status: "good", percent };
      if (percent >= GOAL_NEAR_PERCENT - EPSILON) return { status: "near", percent };
      return { status: "low", percent };
    case "limit":
      if (percent > 100 + EPSILON) return { status: "over", percent };
      if (percent >= LIMIT_NEAR_PERCENT - EPSILON) return { status: "near", percent };
      return { status: "good", percent };
    case "budget":
      if (Math.abs(percent - 100) <= BUDGET_TOLERANCE_PERCENT + EPSILON) {
        return { status: "good", percent };
      }
      return { status: percent > 100 ? "over" : "low", percent };
  }
}

/** True when intake exceeds the upper limit, measured on the limit's own basis. */
export function exceedsUpperLimit(
  amounts: { total: number; supplements: number },
  upperLimit: number | null,
  scope: UpperLimitScope,
): boolean {
  if (upperLimit == null || !(upperLimit > 0)) return false;
  const basis = scope === "supplements" ? amounts.supplements : amounts.total;
  return basis > upperLimit;
}

/**
 * Calories in a set of nutrient amounts: the energy value if one was reported,
 * otherwise estimated from protein, carbs and fat (Atwater factors).
 */
export function energyOf(amounts: NutrientAmounts): number {
  const reported = amounts[ENERGY_KEY];
  if (reported !== undefined) return reported;
  return (
    (amounts.protein ?? 0) * KCAL_PER_GRAM.protein +
    (amounts.carbs ?? 0) * KCAL_PER_GRAM.carbs +
    (amounts.fat ?? 0) * KCAL_PER_GRAM.fat
  );
}

export interface SourceTotals {
  foods: NutrientAmounts;
  supplements: NutrientAmounts;
  total: NutrientAmounts;
}

export interface ExerciseItem {
  id?: string;
  name: string;
  durationMin: number | null;
  caloriesBurned: number;
}

export interface SummaryEntry {
  meal: Meal;
  /** Nutrient amounts for this entry as eaten. Only energy, protein, carbs and fat are read. */
  amounts: NutrientAmounts;
}

export interface SummaryInput {
  date: string;
  /** Whether the user marked this day complete. */
  complete: boolean;
  catalog: readonly NutrientDef[];
  targets: Readonly<Record<string, ResolvedTarget>>;
  totals: SourceTotals;
  entries: readonly SummaryEntry[];
  exercise: readonly ExerciseItem[];
}

export interface NutrientRow {
  key: string;
  name: string;
  unit: string;
  category: string;
  direction: NutrientDirection;
  /** Combined food + supplements, or null when no logged item reports this nutrient. */
  amount: number | null;
  fromFood: number;
  fromSupplements: number;
  target: number | null;
  percent: number | null;
  status: NutrientStatus;
  upperLimit: number | null;
  upperLimitScope: UpperLimitScope;
  overUpperLimit: boolean;
  /** Food alone fell short of a goal that supplements then closed. */
  supplementAssist: boolean;
}

export interface MacroRow {
  key: MacroKey;
  name: string;
  grams: number;
  kcal: number;
  /** Share of the day's macro calories, 0-100. */
  percentOfCalories: number;
  target: number | null;
  percentOfTarget: number | null;
  status: NutrientStatus;
}

export interface MealRow {
  meal: Meal;
  items: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface EnergySummary {
  /** The calorie goal, or null if none. */
  goal: number | null;
  eaten: number;
  burned: number;
  /** eaten - burned */
  net: number;
  /** goal + burned: what you could eat today and still be on goal. Null without a goal. */
  budget: number | null;
  /** budget - eaten. Negative means over. Null without a goal. */
  remaining: number | null;
  /** eaten as a percent of budget. */
  percentOfBudget: number | null;
  status: NutrientStatus;
}

export interface DaySummary {
  date: string;
  complete: boolean;
  /** Nothing at all was logged for the day. */
  isEmpty: boolean;
  hasFood: boolean;
  hasSupplements: boolean;
  energy: EnergySummary;
  macros: MacroRow[];
  meals: MealRow[];
  exercise: { totalBurned: number; totalMinutes: number; items: ExerciseItem[] };
  /** Every tracked nutrient except energy and the three macros, in catalogue order. */
  nutrients: NutrientRow[];
  /** Tracked nutrients that were compared with a target and had data. */
  score: { met: number; total: number };
  groups: {
    /** Goals reached and limits respected. */
    good: NutrientRow[];
    /** Close to a goal or limit. */
    near: NutrientRow[];
    /** Short of a goal, lowest first. */
    low: NutrientRow[];
    /** Over a limit. */
    over: NutrientRow[];
    /** Over an upper limit (possible with supplements). */
    overUpperLimit: NutrientRow[];
    /** Goals that supplements brought up to target. */
    supplementAssist: NutrientRow[];
    /** Nutrients with a target but no data from anything logged. */
    noData: NutrientRow[];
  };
}

const NOT_MICRO = new Set<string>([ENERGY_KEY, ...MACRO_KEYS]);

export function buildDaySummary(input: SummaryInput): DaySummary {
  const { catalog, targets, totals } = input;
  const defOf = new Map(catalog.map((n) => [n.key, n]));
  const targetOf = (key: string): ResolvedTarget | undefined => targets[key];

  // ---- exercise
  const exerciseItems = [...input.exercise];
  const totalBurned = exerciseItems.reduce((s, e) => s + e.caloriesBurned, 0);
  const totalMinutes = exerciseItems.reduce((s, e) => s + (e.durationMin ?? 0), 0);

  // ---- energy
  const eaten = energyOf(totals.total);
  const goal = targetOf(ENERGY_KEY)?.target ?? null;
  const budget = goal == null ? null : goal + totalBurned;
  const remaining = budget == null ? null : budget - eaten;
  const percentOfBudget = budget == null ? null : (eaten / budget) * 100;
  const energyStatus: NutrientStatus =
    budget == null
      ? "no_target"
      : classifyNutrient("budget", eaten, budget).status;

  // ---- macros
  const split = macroCalorieSplit(totals.total);
  const macros: MacroRow[] = MACRO_KEYS.map((key) => {
    const grams = totals.total[key] ?? 0;
    const t = targetOf(key);
    const c = classifyNutrient(t?.direction ?? "goal", totals.total[key], t?.target ?? null);
    return {
      key,
      name: defOf.get(key)?.name ?? key,
      grams,
      kcal: grams * KCAL_PER_GRAM[key],
      percentOfCalories: split[key],
      target: t?.target ?? null,
      percentOfTarget: c.percent,
      status: c.status,
    };
  });

  // ---- meals
  const meals: MealRow[] = MEALS.map((meal) => {
    const own = input.entries.filter((e) => e.meal === meal);
    return {
      meal,
      items: own.length,
      kcal: own.reduce((s, e) => s + energyOf(e.amounts), 0),
      protein: own.reduce((s, e) => s + (e.amounts.protein ?? 0), 0),
      carbs: own.reduce((s, e) => s + (e.amounts.carbs ?? 0), 0),
      fat: own.reduce((s, e) => s + (e.amounts.fat ?? 0), 0),
    };
  });

  // ---- micronutrients and everything that is not energy or a macro
  const nutrients: NutrientRow[] = catalog
    .filter((n) => !NOT_MICRO.has(n.key))
    .map((n) => {
      const t = targetOf(n.key);
      const direction = t?.direction ?? n.direction ?? "goal";
      const target = t?.target ?? null;
      const amount = totals.total[n.key];
      const fromFood = totals.foods[n.key] ?? 0;
      const fromSupplements = totals.supplements[n.key] ?? 0;
      const c = classifyNutrient(direction, amount, target);
      const upperLimit = t?.upperLimit ?? null;
      const upperLimitScope = t?.upperLimitScope ?? "total";

      const foodOnly = classifyNutrient(direction, totals.foods[n.key] ?? 0, target);
      const supplementAssist =
        direction === "goal" &&
        fromSupplements > 0 &&
        c.status === "good" &&
        foodOnly.status !== "good";

      return {
        key: n.key,
        name: n.name,
        unit: n.unit,
        category: n.category,
        direction,
        amount: amount ?? null,
        fromFood,
        fromSupplements,
        target,
        percent: c.percent,
        status: c.status,
        upperLimit,
        upperLimitScope,
        overUpperLimit: exceedsUpperLimit(
          { total: amount ?? 0, supplements: fromSupplements },
          upperLimit,
          upperLimitScope,
        ),
        supplementAssist,
      };
    });

  const compared = nutrients.filter((r) =>
    (["good", "near", "low", "over"] as NutrientStatus[]).includes(r.status),
  );
  const byPercentAsc = (a: NutrientRow, b: NutrientRow) => (a.percent ?? 0) - (b.percent ?? 0);

  const hasFood = Object.keys(totals.foods).length > 0 || input.entries.length > 0;
  const hasSupplements = Object.keys(totals.supplements).length > 0;

  return {
    date: input.date,
    complete: input.complete,
    isEmpty: !hasFood && !hasSupplements && exerciseItems.length === 0,
    hasFood,
    hasSupplements,
    energy: {
      goal,
      eaten,
      burned: totalBurned,
      net: eaten - totalBurned,
      budget,
      remaining,
      percentOfBudget,
      status: energyStatus,
    },
    macros,
    meals,
    exercise: { totalBurned, totalMinutes, items: exerciseItems },
    nutrients,
    score: {
      met: compared.filter((r) => r.status === "good").length,
      total: compared.length,
    },
    groups: {
      good: compared.filter((r) => r.status === "good"),
      near: compared.filter((r) => r.status === "near").sort(byPercentAsc),
      low: compared.filter((r) => r.status === "low").sort(byPercentAsc),
      over: compared.filter((r) => r.status === "over").sort((a, b) => byPercentAsc(b, a)),
      overUpperLimit: nutrients.filter((r) => r.overUpperLimit),
      supplementAssist: nutrients.filter((r) => r.supplementAssist),
      noData: nutrients.filter((r) => r.status === "no_data"),
    },
  };
}
