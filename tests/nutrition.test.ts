import { describe, expect, it } from "vitest";
import {
  macroCalorieSplit,
  macroGramsFromSplit,
  percentOfTarget,
  round,
  scalePer100g,
  scalePerServing,
  servingsToGrams,
  sumAmounts,
} from "../src/lib/nutrition";
import { NUTRIENT_CATALOG, NUTRIENT_KEYS } from "../src/db/nutrient-catalog";

describe("scaling", () => {
  it("scales per-100g amounts to the eaten weight", () => {
    expect(scalePer100g({ protein: 10, carbs: 50 }, 250)).toEqual({ protein: 25, carbs: 125 });
  });

  it("scales per-serving amounts by servings", () => {
    expect(scalePerServing({ vit_d: 25 }, 2)).toEqual({ vit_d: 50 });
  });

  it("converts servings to grams and rejects bad input", () => {
    expect(servingsToGrams(1.5, 40)).toBe(60);
    expect(() => servingsToGrams(0, 40)).toThrow(RangeError);
    expect(() => servingsToGrams(1, 0)).toThrow(RangeError);
  });
});

describe("sumAmounts", () => {
  it("adds maps, treating missing keys as zero", () => {
    expect(sumAmounts({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 5, c: 4 });
  });

  it("returns an empty map for no input", () => {
    expect(sumAmounts()).toEqual({});
  });
});

describe("percentOfTarget", () => {
  it("returns progress as a percentage, uncapped", () => {
    expect(percentOfTarget(50, 200)).toBe(25);
    expect(percentOfTarget(300, 200)).toBe(150);
  });

  it("returns null without a usable target", () => {
    expect(percentOfTarget(50, null)).toBeNull();
    expect(percentOfTarget(50, undefined)).toBeNull();
    expect(percentOfTarget(50, 0)).toBeNull();
  });
});

describe("macro calories", () => {
  it("splits calories by Atwater factors", () => {
    // 100 g protein = 400 kcal, 100 g carbs = 400 kcal, 200/9 g fat = 200 kcal
    const split = macroCalorieSplit({ protein: 100, carbs: 100, fat: 200 / 9 });
    expect(round(split.protein)).toBe(40);
    expect(round(split.carbs)).toBe(40);
    expect(round(split.fat)).toBe(20);
  });

  it("returns zeros when nothing was eaten", () => {
    expect(macroCalorieSplit({})).toEqual({ protein: 0, carbs: 0, fat: 0 });
  });

  it("derives gram targets from a calorie goal and split", () => {
    const grams = macroGramsFromSplit(2000, { protein: 30, carbs: 40, fat: 30 });
    expect(round(grams.protein!)).toBe(150); // 600 kcal / 4
    expect(round(grams.carbs!)).toBe(200); // 800 kcal / 4
    expect(round(grams.fat!)).toBe(66.7); // 600 kcal / 9
  });

  it("rejects a split that does not sum to 100", () => {
    expect(() => macroGramsFromSplit(2000, { protein: 30, carbs: 30, fat: 30 })).toThrow(RangeError);
  });
});

describe("nutrient catalogue", () => {
  it("has unique keys", () => {
    expect(new Set(NUTRIENT_KEYS).size).toBe(NUTRIENT_CATALOG.length);
  });

  it("has unique USDA numbers where set", () => {
    const numbers = NUTRIENT_CATALOG.flatMap((n) => (n.usdaNumber ? [n.usdaNumber] : []));
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("covers the macros the maths relies on", () => {
    for (const key of ["energy_kcal", "protein", "carbs", "fat"]) {
      expect(NUTRIENT_KEYS).toContain(key);
    }
  });
});
