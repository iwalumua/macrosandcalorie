import { describe, expect, it } from "vitest";
import type { NutrientDef } from "../src/db/nutrient-catalog";
import {
  buildDaySummary,
  classifyNutrient,
  energyOf,
  exceedsUpperLimit,
  type SummaryInput,
} from "../src/lib/summary";
import { resolveTargets } from "../src/lib/targets";

/*
 * A tiny synthetic catalogue with round numbers, so every expectation below can
 * be checked by hand. None of this is real nutrition data.
 */
const CATALOG: NutrientDef[] = [
  { key: "energy_kcal", name: "Energy", unit: "kcal", category: "energy", dailyValue: 2000, direction: "budget" },
  { key: "protein", name: "Protein", unit: "g", category: "macro", dailyValue: 100 },
  { key: "carbs", name: "Carbohydrates", unit: "g", category: "macro", dailyValue: 200, direction: "budget" },
  { key: "fat", name: "Fat", unit: "g", category: "macro", dailyValue: 50, direction: "budget" },
  { key: "fiber", name: "Fiber", unit: "g", category: "macro", dailyValue: 30 },
  { key: "sodium", name: "Sodium", unit: "mg", category: "mineral", dailyValue: 2000, direction: "limit" },
  { key: "vit_d", name: "Vitamin D", unit: "mcg", category: "vitamin", dailyValue: 20, upperLimit: 100 },
  {
    key: "magnesium",
    name: "Magnesium",
    unit: "mg",
    category: "mineral",
    dailyValue: 400,
    upperLimit: 350,
    upperLimitScope: "supplements",
  },
  { key: "vit_c", name: "Vitamin C", unit: "mg", category: "vitamin", dailyValue: 100 },
  { key: "sugars", name: "Sugars", unit: "g", category: "macro" }, // no target at all
];

function summarize(over: Partial<SummaryInput> & { foods?: Record<string, number>; supplements?: Record<string, number> }) {
  const foods = over.foods ?? {};
  const supplements = over.supplements ?? {};
  const total: Record<string, number> = { ...foods };
  for (const [k, v] of Object.entries(supplements)) total[k] = (total[k] ?? 0) + v;
  return buildDaySummary({
    date: "2026-03-10",
    complete: false,
    catalog: CATALOG,
    targets: resolveTargets(CATALOG, {}),
    totals: { foods, supplements, total },
    entries: [],
    exercise: [],
    ...over,
  });
}

describe("classifyNutrient", () => {
  it("goal: good at 100%, near from 70%, low below", () => {
    expect(classifyNutrient("goal", 100, 100).status).toBe("good");
    expect(classifyNutrient("goal", 250, 100).status).toBe("good");
    expect(classifyNutrient("goal", 99.9, 100).status).toBe("near");
    expect(classifyNutrient("goal", 70, 100).status).toBe("near");
    expect(classifyNutrient("goal", 69.9, 100).status).toBe("low");
    expect(classifyNutrient("goal", 0, 100)).toEqual({ status: "low", percent: 0 });
  });

  it("limit: good under 90%, near up to 100%, over above", () => {
    expect(classifyNutrient("limit", 89, 100).status).toBe("good");
    expect(classifyNutrient("limit", 90, 100).status).toBe("near");
    expect(classifyNutrient("limit", 100, 100).status).toBe("near");
    expect(classifyNutrient("limit", 100.1, 100).status).toBe("over");
  });

  it("budget: good within 10 points of 100, otherwise low or over", () => {
    expect(classifyNutrient("budget", 90, 100).status).toBe("good");
    expect(classifyNutrient("budget", 110, 100).status).toBe("good");
    expect(classifyNutrient("budget", 89, 100).status).toBe("low");
    expect(classifyNutrient("budget", 111, 100).status).toBe("over");
  });

  it("puts values exactly on a boundary in the inclusive band, despite floating point", () => {
    // (0.09 / 0.1) * 100 === 89.99999999999999 and (110 / 100) * 100 === 110.00000000000001,
    // so a naive comparison misfiles values that sit exactly on a boundary.
    expect(classifyNutrient("limit", 0.09, 0.1).status).toBe("near");
    expect(classifyNutrient("budget", 110, 100).status).toBe("good");

    // Sweep many targets: 70% of a goal, 90% of a limit and +/-10% of a budget
    // must always land on the inclusive side.
    for (let i = 1; i <= 3000; i++) {
      const target = i / 10;
      const at = (fraction: number) => Math.round(target * fraction * 1e6) / 1e6;
      expect(classifyNutrient("goal", at(0.7), target).status, `goal 70% of ${target}`).toBe("near");
      expect(classifyNutrient("goal", at(1), target).status, `goal 100% of ${target}`).toBe("good");
      expect(classifyNutrient("limit", at(0.9), target).status, `limit 90% of ${target}`).toBe("near");
      expect(classifyNutrient("limit", at(1), target).status, `limit 100% of ${target}`).toBe("near");
      expect(classifyNutrient("budget", at(0.9), target).status, `budget 90% of ${target}`).toBe("good");
      expect(classifyNutrient("budget", at(1.1), target).status, `budget 110% of ${target}`).toBe("good");
    }
  });

  it("separates 'no data' (unknown) from zero, and handles a missing target", () => {
    expect(classifyNutrient("goal", undefined, 100)).toEqual({ status: "no_data", percent: null });
    expect(classifyNutrient("goal", 0, 100).status).toBe("low");
    expect(classifyNutrient("goal", 50, null)).toEqual({ status: "no_target", percent: null });
    expect(classifyNutrient("goal", 50, 0).status).toBe("no_target");
  });
});

describe("exceedsUpperLimit", () => {
  it("total scope compares food plus supplements", () => {
    expect(exceedsUpperLimit({ total: 120, supplements: 20 }, 100, "total")).toBe(true);
    expect(exceedsUpperLimit({ total: 100, supplements: 20 }, 100, "total")).toBe(false);
  });

  it("supplements scope ignores food entirely", () => {
    expect(exceedsUpperLimit({ total: 900, supplements: 300 }, 350, "supplements")).toBe(false);
    expect(exceedsUpperLimit({ total: 900, supplements: 351 }, 350, "supplements")).toBe(true);
  });

  it("is false without a limit", () => {
    expect(exceedsUpperLimit({ total: 9999, supplements: 9999 }, null, "total")).toBe(false);
  });
});

describe("energyOf", () => {
  it("uses the reported energy when present", () => {
    expect(energyOf({ energy_kcal: 123, protein: 100 })).toBe(123);
  });
  it("estimates from macros when energy was not reported", () => {
    expect(energyOf({ protein: 10, carbs: 10, fat: 10 })).toBe(10 * 4 + 10 * 4 + 10 * 9);
  });
  it("is zero for nothing", () => {
    expect(energyOf({})).toBe(0);
  });
});

describe("buildDaySummary: energy balance", () => {
  it("nets exercise against food and adds it to the budget", () => {
    const s = summarize({
      foods: { energy_kcal: 1800 },
      exercise: [
        { name: "Test run", durationMin: 30, caloriesBurned: 200 },
        { name: "Test walk", durationMin: null, caloriesBurned: 100 },
      ],
    });
    expect(s.energy.goal).toBe(2000);
    expect(s.energy.eaten).toBe(1800);
    expect(s.energy.burned).toBe(300);
    expect(s.energy.net).toBe(1500);
    expect(s.energy.budget).toBe(2300);
    expect(s.energy.remaining).toBe(500);
    expect(s.energy.percentOfBudget).toBeCloseTo((1800 / 2300) * 100);
    expect(s.exercise.totalBurned).toBe(300);
    expect(s.exercise.totalMinutes).toBe(30); // a missing duration counts as zero minutes
  });

  it("reports negative remaining when over", () => {
    const s = summarize({ foods: { energy_kcal: 2500 } });
    expect(s.energy.remaining).toBe(-500);
    expect(s.energy.status).toBe("over");
  });

  it("has no budget or remaining without a calorie goal", () => {
    const targets = resolveTargets(CATALOG, {});
    targets.energy_kcal = { ...targets.energy_kcal!, target: null };
    const s = summarize({ targets, foods: { energy_kcal: 1000 } });
    expect(s.energy.goal).toBeNull();
    expect(s.energy.budget).toBeNull();
    expect(s.energy.remaining).toBeNull();
    expect(s.energy.status).toBe("no_target");
    expect(s.energy.eaten).toBe(1000);
  });

  it("falls back to macro-derived calories when no energy was reported", () => {
    const s = summarize({ foods: { protein: 25, carbs: 50, fat: 10 } });
    expect(s.energy.eaten).toBe(25 * 4 + 50 * 4 + 10 * 9);
  });

  it("honours a user-set calorie goal", () => {
    const targets = resolveTargets(CATALOG, { energy_kcal: { target: 1500, upperLimit: null } });
    const s = summarize({ targets, foods: { energy_kcal: 1500 } });
    expect(s.energy.goal).toBe(1500);
    expect(s.energy.status).toBe("good");
  });
});

describe("buildDaySummary: macros and meals", () => {
  it("reports grams, calories, share of calories and progress for each macro", () => {
    const s = summarize({ foods: { protein: 100, carbs: 100, fat: 200 / 9 } });
    const byKey = Object.fromEntries(s.macros.map((m) => [m.key, m]));
    expect(byKey.protein!.grams).toBe(100);
    expect(byKey.protein!.kcal).toBe(400);
    expect(byKey.protein!.percentOfCalories).toBeCloseTo(40);
    expect(byKey.carbs!.percentOfCalories).toBeCloseTo(40);
    expect(byKey.fat!.percentOfCalories).toBeCloseTo(20);
    expect(byKey.protein!.percentOfTarget).toBeCloseTo(100);
    expect(byKey.protein!.status).toBe("good");
    expect(byKey.carbs!.percentOfTarget).toBeCloseTo(50);
    expect(byKey.carbs!.status).toBe("low");
  });

  it("totals each meal from its own entries", () => {
    const s = summarize({
      entries: [
        { meal: "breakfast", amounts: { energy_kcal: 300, protein: 10, carbs: 40, fat: 5 } },
        { meal: "breakfast", amounts: { energy_kcal: 100, protein: 2 } },
        { meal: "dinner", amounts: { protein: 20, carbs: 0, fat: 10 } }, // no energy value: estimated
      ],
    });
    const meal = (m: string) => s.meals.find((x) => x.meal === m)!;
    expect(meal("breakfast")).toMatchObject({ items: 2, kcal: 400, protein: 12, carbs: 40, fat: 5 });
    expect(meal("dinner").kcal).toBe(20 * 4 + 10 * 9);
    expect(meal("lunch")).toMatchObject({ items: 0, kcal: 0 });
    expect(s.meals.map((m) => m.meal)).toEqual(["breakfast", "lunch", "dinner", "snack"]);
  });
});

describe("buildDaySummary: nutrients", () => {
  it("leaves energy and the three macros out of the nutrient list", () => {
    const keys = summarize({}).nutrients.map((n) => n.key);
    expect(keys).not.toContain("energy_kcal");
    expect(keys).not.toContain("protein");
    expect(keys).not.toContain("carbs");
    expect(keys).not.toContain("fat");
    expect(keys).toContain("fiber");
  });

  it("groups by status and sorts the shortfalls lowest first", () => {
    const s = summarize({
      foods: { fiber: 30, sodium: 1000, vit_d: 14, vit_c: 10, magnesium: 100 },
    });
    expect(s.groups.good.map((r) => r.key).sort()).toEqual(["fiber", "sodium"]);
    expect(s.groups.near.map((r) => r.key)).toEqual(["vit_d"]); // 70%
    expect(s.groups.low.map((r) => r.key)).toEqual(["vit_c", "magnesium"]); // 10%, 25%
    expect(s.score).toEqual({ met: 2, total: 5 });
  });

  it("does not call a nutrient with no data a deficiency", () => {
    // Only fiber was reported by anything logged; vitamin D, C etc. are unknown.
    const s = summarize({ foods: { fiber: 10 } });
    const vitC = s.nutrients.find((n) => n.key === "vit_c")!;
    expect(vitC.status).toBe("no_data");
    expect(vitC.amount).toBeNull();
    expect(s.groups.low.map((r) => r.key)).toEqual(["fiber"]);
    expect(s.groups.noData.map((r) => r.key)).toEqual(
      expect.arrayContaining(["vit_c", "vit_d", "magnesium", "sodium"]),
    );
    // Unknowns are excluded from the score rather than counted as misses.
    expect(s.score).toEqual({ met: 0, total: 1 });
  });

  it("treats an explicit zero as real data", () => {
    const s = summarize({ foods: { vit_c: 0 } });
    expect(s.nutrients.find((n) => n.key === "vit_c")!.status).toBe("low");
  });

  it("lists limit nutrients that went over, worst first", () => {
    const s = summarize({ foods: { sodium: 2600 } });
    expect(s.groups.over.map((r) => r.key)).toEqual(["sodium"]);
    expect(s.groups.good.map((r) => r.key)).not.toContain("sodium");
  });

  it("reports nutrients with no target as no_target and keeps them out of the score", () => {
    const s = summarize({ foods: { sugars: 12 } });
    const sugars = s.nutrients.find((n) => n.key === "sugars")!;
    expect(sugars.status).toBe("no_target");
    expect(sugars.amount).toBe(12);
    expect(s.score.total).toBe(0);
  });

  it("applies a user's own target instead of the default", () => {
    const targets = resolveTargets(CATALOG, { vit_c: { target: 10, upperLimit: null } });
    const s = summarize({ targets, foods: { vit_c: 10 } });
    expect(s.nutrients.find((n) => n.key === "vit_c")!.status).toBe("good");
  });
});

describe("buildDaySummary: supplements", () => {
  it("flags goals that supplements brought up to target", () => {
    const s = summarize({ foods: { vit_d: 5 }, supplements: { vit_d: 15 } });
    const d = s.nutrients.find((n) => n.key === "vit_d")!;
    expect(d.fromFood).toBe(5);
    expect(d.fromSupplements).toBe(15);
    expect(d.amount).toBe(20);
    expect(d.status).toBe("good");
    expect(d.supplementAssist).toBe(true);
    expect(s.groups.supplementAssist.map((r) => r.key)).toEqual(["vit_d"]);
  });

  it("does not credit supplements when food already met the goal", () => {
    const s = summarize({ foods: { vit_d: 25 }, supplements: { vit_d: 5 } });
    expect(s.nutrients.find((n) => n.key === "vit_d")!.supplementAssist).toBe(false);
  });

  it("does not credit supplements when the goal is still missed", () => {
    const s = summarize({ foods: { vit_d: 1 }, supplements: { vit_d: 5 } });
    expect(s.nutrients.find((n) => n.key === "vit_d")!.supplementAssist).toBe(false);
  });

  it("flags a total upper limit exceeded by food plus supplements", () => {
    const s = summarize({ foods: { vit_d: 60 }, supplements: { vit_d: 60 } });
    expect(s.groups.overUpperLimit.map((r) => r.key)).toEqual(["vit_d"]);
  });

  it("checks a supplements-only limit against supplements, not food", () => {
    // 500 mg magnesium from food alone is above 350 but is not a supplement overdose.
    const foodHeavy = summarize({ foods: { magnesium: 500 }, supplements: { magnesium: 100 } });
    expect(foodHeavy.groups.overUpperLimit).toEqual([]);
    const supplementHeavy = summarize({ foods: { magnesium: 100 }, supplements: { magnesium: 400 } });
    expect(supplementHeavy.groups.overUpperLimit.map((r) => r.key)).toEqual(["magnesium"]);
  });

  it("respects a user's own upper limit", () => {
    const targets = resolveTargets(CATALOG, { vit_d: { target: 20, upperLimit: 30 } });
    const s = summarize({ targets, foods: { vit_d: 40 } });
    expect(s.groups.overUpperLimit.map((r) => r.key)).toEqual(["vit_d"]);
  });
});

describe("buildDaySummary: day state", () => {
  it("recognises a completely empty day", () => {
    const s = summarize({});
    expect(s.isEmpty).toBe(true);
    expect(s.hasFood).toBe(false);
    expect(s.hasSupplements).toBe(false);
  });

  it("is not empty with only exercise, only food, or only supplements", () => {
    expect(summarize({ exercise: [{ name: "Test", durationMin: 5, caloriesBurned: 10 }] }).isEmpty).toBe(false);
    expect(summarize({ foods: { fiber: 1 } }).isEmpty).toBe(false);
    expect(summarize({ supplements: { vit_d: 1 } }).isEmpty).toBe(false);
  });

  it("carries the date and completion flag through", () => {
    const s = summarize({ complete: true });
    expect(s.date).toBe("2026-03-10");
    expect(s.complete).toBe(true);
  });
});
