import { describe, expect, it } from "vitest";
import { NUTRIENT_CATALOG } from "../src/db/nutrient-catalog";
import { mealType } from "../src/db/schema";
import { MEALS } from "../src/lib/meals";

/** Invariants on the real catalogue's reference metadata (direction and upper limits). */
describe("nutrient reference metadata", () => {
  it("every limit-direction nutrient has a value to stay under", () => {
    for (const n of NUTRIENT_CATALOG.filter((n) => n.direction === "limit")) {
      expect(n.dailyValue, n.key).toBeGreaterThan(0);
    }
  });

  it("upper limits are positive", () => {
    for (const n of NUTRIENT_CATALOG.filter((n) => n.upperLimit !== undefined)) {
      expect(n.upperLimit, n.key).toBeGreaterThan(0);
    }
  });

  it("a total-intake upper limit is not below the nutrient's own daily value", () => {
    // Supplements-only limits are excluded on purpose: magnesium's 350 mg limit
    // applies to supplemental magnesium and is legitimately below its 420 mg
    // total-intake Daily Value, because they are measured on different bases.
    for (const n of NUTRIENT_CATALOG.filter(
      (n) => n.upperLimit !== undefined && (n.upperLimitScope ?? "total") === "total",
    )) {
      if (n.dailyValue !== undefined) expect(n.upperLimit, n.key).toBeGreaterThanOrEqual(n.dailyValue);
    }
  });

  it("a supplements-only scope is only declared alongside an upper limit", () => {
    for (const n of NUTRIENT_CATALOG.filter((n) => n.upperLimitScope !== undefined)) {
      expect(n.upperLimit, n.key).toBeDefined();
    }
  });

  it("energy, carbs and fat are budgets; protein is a goal", () => {
    const dir = (k: string) => NUTRIENT_CATALOG.find((n) => n.key === k)?.direction ?? "goal";
    expect(["energy_kcal", "carbs", "fat"].map(dir)).toEqual(["budget", "budget", "budget"]);
    expect(dir("protein")).toBe("goal");
  });

  it("lib MEALS matches the database enum", () => {
    expect([...mealType.enumValues]).toEqual([...MEALS]);
  });
});
