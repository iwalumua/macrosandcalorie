import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "../src/db/client";
import { loadDay } from "../src/db/day";
import {
  addExercise,
  createCustomFood,
  createSupplementProduct,
  deleteDiaryEntry,
  deleteExercise,
  deleteSupplementLog,
  ensureLocalUser,
  logFood,
  logStackRemaining,
  logSupplement,
  removeStackItem,
  resetTargets,
  saveCalorieGoal,
  saveTargets,
  setDayComplete,
  setStackItem,
  updateDiaryEntry,
} from "../src/db/mutations";
import {
  escapeLike,
  getDiaryDay,
  getFood,
  getTargetOverrides,
  listRecentFoods,
  listSupplementProducts,
  searchFoods,
} from "../src/db/queries";
import { diaryEntries, foodNutrients, nutrients } from "../src/db/schema";
import { InputError } from "../src/lib/errors";
import { makeUser, setupTestDb, TEST_DATABASE_URL } from "./helpers/test-db";

/**
 * Exercises the diary, supplement, exercise, target and day-summary data layer
 * against real Postgres. All fixtures are synthetic: round numbers and
 * "Test ..." names, not real nutrition data. Skipped unless TEST_DATABASE_URL is set.
 */
describe.skipIf(!TEST_DATABASE_URL)("diary data layer (postgres)", () => {
  let h: DbHandle;
  let alice: string;
  let bob: string;
  const DAY = "2026-03-10";

  beforeAll(async () => {
    h = await setupTestDb();
    alice = await makeUser(h, "alice@example.com");
    bob = await makeUser(h, "bob@example.com");
  });
  afterAll(async () => {
    await h?.close();
  });

  describe("custom foods", () => {
    it("converts label values per serving into per-100 g and stores only what was entered", async () => {
      const id = await createCustomFood(h.db, alice, {
        name: "Test Bar",
        brand: "Test Brand",
        servingLabel: "1 bar",
        servingGrams: 50,
        perServing: { energy_kcal: 200, protein: 10, carbs: 30 },
      });
      const food = await getFood(h.db, alice, id);
      expect(food).not.toBeNull();
      expect(food!.per100g).toEqual({ energy_kcal: 400, protein: 20, carbs: 60 });
      expect(food!.per100g.fat).toBeUndefined(); // not entered => unknown, not zero
      expect(food!.servings).toEqual([expect.objectContaining({ label: "1 bar", grams: 50, isDefault: true })]);
      expect(food!.custom).toBe(true);
    });

    it("estimates calories from macros when calories are left out", async () => {
      const id = await createCustomFood(h.db, alice, {
        name: "Test Macro Only",
        servingLabel: "1 serving",
        servingGrams: 50,
        perServing: { protein: 10, carbs: 10 }, // 10*4 + 10*4 = 80 kcal per serving
      });
      expect((await getFood(h.db, alice, id))!.per100g.energy_kcal).toBeCloseTo(160);
    });

    it.each([
      ["unknown nutrient", { servingGrams: 50, perServing: { not_a_nutrient: 1 } }],
      ["negative amount", { servingGrams: 50, perServing: { protein: -1 } }],
      ["NaN amount", { servingGrams: 50, perServing: { protein: Number.NaN } }],
      ["zero serving weight", { servingGrams: 0, perServing: { protein: 1 } }],
      ["no nutrients at all", { servingGrams: 50, perServing: {} }],
    ])("rejects %s", async (_label, bad) => {
      await expect(
        createCustomFood(h.db, alice, { name: "Test Bad", servingLabel: "1", ...bad }),
      ).rejects.toBeInstanceOf(InputError);
    });

    it("rejects a blank name", async () => {
      await expect(
        createCustomFood(h.db, alice, { name: "   ", servingLabel: "1", servingGrams: 10, perServing: { protein: 1 } }),
      ).rejects.toBeInstanceOf(InputError);
    });

    it("rolls back the whole food if a later insert fails", async () => {
      const before = (await h.db.select().from(foodNutrients)).length;
      await expect(
        createCustomFood(h.db, alice, {
          name: "Test Atomic",
          servingLabel: "1",
          servingGrams: 10,
          perServing: { protein: 1, bogus: 1 },
        }),
      ).rejects.toBeInstanceOf(InputError);
      expect((await searchFoods(h.db, alice, "Test Atomic")).length).toBe(0);
      expect((await h.db.select().from(foodNutrients)).length).toBe(before);
    });
  });

  describe("food search", () => {
    it("matches every word in name or brand, case-insensitively, and ranks prefix matches first", async () => {
      await createCustomFood(h.db, alice, { name: "Test Oat Milk", brand: "Zed", servingLabel: "1 cup", servingGrams: 240, perServing: { energy_kcal: 120 } });
      await createCustomFood(h.db, alice, { name: "Plain Test Oat", servingLabel: "1 cup", servingGrams: 40, perServing: { energy_kcal: 150 } });

      const byWords = await searchFoods(h.db, alice, "oat test");
      expect(byWords.map((f) => f.name).sort()).toEqual(["Plain Test Oat", "Test Oat Milk"]);

      const byBrand = await searchFoods(h.db, alice, "zed");
      expect(byBrand.map((f) => f.name)).toEqual(["Test Oat Milk"]);

      const prefixed = await searchFoods(h.db, alice, "test oat");
      expect(prefixed[0]!.name).toBe("Test Oat Milk"); // starts with the query
    });

    it("treats % and _ literally instead of as wildcards", async () => {
      await createCustomFood(h.db, alice, { name: "Test 100% Juice", servingLabel: "1", servingGrams: 100, perServing: { energy_kcal: 40 } });
      await createCustomFood(h.db, alice, { name: "Test 1000 Juice", servingLabel: "1", servingGrams: 100, perServing: { energy_kcal: 40 } });
      expect((await searchFoods(h.db, alice, "100%")).map((f) => f.name)).toEqual(["Test 100% Juice"]);
      expect((await searchFoods(h.db, alice, "%")).map((f) => f.name)).toEqual(["Test 100% Juice"]);
      expect(escapeLike("a_b%c\\d")).toBe("a\\_b\\%c\\\\d");
    });

    it("hides other users' custom foods", async () => {
      const id = await createCustomFood(h.db, bob, { name: "Test Bobs Secret Snack", servingLabel: "1", servingGrams: 10, perServing: { energy_kcal: 10 } });
      expect(await searchFoods(h.db, alice, "Bobs Secret")).toEqual([]);
      expect(await getFood(h.db, alice, id)).toBeNull();
      expect((await searchFoods(h.db, bob, "Bobs Secret")).length).toBe(1);
    });

    it("includes energy per 100 g and the default serving", async () => {
      const [f] = await searchFoods(h.db, alice, "Test Bar");
      expect(f).toMatchObject({ name: "Test Bar", kcalPer100g: 400, defaultServing: { label: "1 bar", grams: 50 } });
    });

    it("an empty query lists the newest foods first", async () => {
      const list = await searchFoods(h.db, alice, "");
      expect(list.length).toBeGreaterThan(3);
      expect(list.find((f) => f.name === "Test Bobs Secret Snack")).toBeUndefined();
    });
  });

  describe("logging food", () => {
    let barId: string;
    let barServingId: string;
    beforeAll(async () => {
      const [bar] = await searchFoods(h.db, alice, "Test Bar");
      barId = bar!.id;
      barServingId = (await getFood(h.db, alice, barId))!.servings[0]!.id;
    });

    it("resolves servings to grams and grams as-is", async () => {
      await logFood(h.db, alice, { date: DAY, meal: "breakfast", foodId: barId, servingId: barServingId, quantity: 2 });
      await logFood(h.db, alice, { date: DAY, meal: "snack", foodId: barId, servingId: null, quantity: 25 });
      const day = await getDiaryDay(h.db, alice, DAY);
      const breakfast = day.entries.find((e) => e.meal === "breakfast")!;
      const snack = day.entries.find((e) => e.meal === "snack")!;
      expect(breakfast.grams).toBe(100);
      expect(breakfast.servingLabel).toBe("1 bar");
      expect(breakfast.amounts).toMatchObject({ energy_kcal: 400, protein: 20, carbs: 60 });
      expect(snack.grams).toBe(25);
      expect(snack.servingLabel).toBeNull();
      expect(snack.amounts.energy_kcal).toBe(100);
    });

    it("rejects bad amounts, other users' foods and mismatched servings", async () => {
      const base = { date: DAY, meal: "lunch" as const, foodId: barId, servingId: null };
      await expect(logFood(h.db, alice, { ...base, quantity: 0 })).rejects.toBeInstanceOf(InputError);
      await expect(logFood(h.db, alice, { ...base, quantity: -5 })).rejects.toBeInstanceOf(InputError);
      await expect(logFood(h.db, alice, { ...base, quantity: Number.NaN })).rejects.toBeInstanceOf(InputError);
      await expect(logFood(h.db, alice, { ...base, quantity: 1e9 })).rejects.toBeInstanceOf(InputError);

      const bobsFood = (await searchFoods(h.db, bob, "Bobs Secret"))[0]!;
      await expect(logFood(h.db, alice, { ...base, foodId: bobsFood.id, quantity: 10 })).rejects.toBeInstanceOf(InputError);

      const otherServing = (await getFood(h.db, alice, (await searchFoods(h.db, alice, "Test Macro Only"))[0]!.id))!.servings[0]!.id;
      await expect(logFood(h.db, alice, { ...base, servingId: otherServing, quantity: 1 })).rejects.toBeInstanceOf(InputError);
    });

    it("edits an entry and recomputes grams", async () => {
      const id = await logFood(h.db, alice, { date: DAY, meal: "lunch", foodId: barId, servingId: barServingId, quantity: 1 });
      expect(await updateDiaryEntry(h.db, alice, id, { meal: "dinner", servingId: barServingId, quantity: 3 })).toBe(true);
      const e = (await getDiaryDay(h.db, alice, DAY)).entries.find((x) => x.id === id)!;
      expect(e).toMatchObject({ meal: "dinner", quantity: 3, grams: 150 });
      expect(e.amounts.energy_kcal).toBe(600);
    });

    it("cannot edit or delete another user's entry", async () => {
      const id = await logFood(h.db, alice, { date: DAY, meal: "lunch", foodId: barId, servingId: null, quantity: 10 });
      expect(await updateDiaryEntry(h.db, bob, id, { meal: "lunch", servingId: null, quantity: 999 })).toBe(false);
      expect(await deleteDiaryEntry(h.db, bob, id)).toBe(false);
      expect((await h.db.select().from(diaryEntries).where(eq(diaryEntries.id, id)))[0]!.grams).toBe(10);
      expect(await deleteDiaryEntry(h.db, alice, id)).toBe(true);
      expect(await deleteDiaryEntry(h.db, alice, id)).toBe(false); // already gone
    });

    it("lists recently logged foods, newest first", async () => {
      const recent = await listRecentFoods(h.db, alice);
      expect(recent.length).toBeGreaterThan(0);
      expect(recent[0]!.name).toBe("Test Bar");
    });
  });

  describe("supplements and the stack", () => {
    let d3: string;
    let mag: string;

    beforeAll(async () => {
      d3 = await createSupplementProduct(h.db, alice, { name: "Test D3", servingLabel: "1 capsule", perServing: { vit_d: 10 } });
      mag = await createSupplementProduct(h.db, alice, { name: "Test Magnesium", servingLabel: "2 tablets", perServing: { magnesium: 200 } });
    });

    it("creates products with per-serving nutrients and reports stack membership", async () => {
      await setStackItem(h.db, alice, d3, { servingsPerDose: 1, timing: "morning" });
      const list = await listSupplementProducts(h.db, alice);
      const p = list.find((x) => x.id === d3)!;
      expect(p.perServing).toEqual({ vit_d: 10 });
      expect(p.stack).toEqual({ servingsPerDose: 1, timing: "morning", active: true });
      expect(list.find((x) => x.id === mag)!.stack).toBeNull();
    });

    it("logStackRemaining logs each due item once and never double-counts", async () => {
      await setStackItem(h.db, alice, mag, { servingsPerDose: 2, timing: "bedtime" });
      const day = "2026-03-11";

      expect(await logStackRemaining(h.db, alice, day, "morning")).toBe(1); // only D3 is morning
      expect(await logStackRemaining(h.db, alice, day, "morning")).toBe(0); // already logged
      expect(await logStackRemaining(h.db, alice, day)).toBe(1); // magnesium remains

      const logs = (await getDiaryDay(h.db, alice, day)).supplementLogs;
      expect(logs.map((l) => [l.name, l.servings]).sort()).toEqual([["Test D3", 1], ["Test Magnesium", 2]]);
    });

    it("logs a single dose and counts it in the day's totals", async () => {
      await logSupplement(h.db, alice, { productId: d3, date: DAY, servings: 2 });
      const { totals } = await loadDay(h.db, alice, DAY);
      expect(totals.supplements.vit_d).toBe(20);
    });

    it("rejects invalid servings and products the user cannot see", async () => {
      await expect(logSupplement(h.db, alice, { productId: d3, date: DAY, servings: 0 })).rejects.toBeInstanceOf(InputError);
      const bobs = await createSupplementProduct(h.db, bob, { name: "Test Bobs Pill", servingLabel: "1", perServing: {} });
      await expect(logSupplement(h.db, alice, { productId: bobs, date: DAY, servings: 1 })).rejects.toBeInstanceOf(InputError);
      await expect(setStackItem(h.db, alice, bobs, { servingsPerDose: 1, timing: null })).rejects.toBeInstanceOf(InputError);
      expect((await listSupplementProducts(h.db, alice)).find((p) => p.id === bobs)).toBeUndefined();
    });

    it("removes from the stack and deletes only your own logs", async () => {
      await removeStackItem(h.db, alice, mag);
      expect((await listSupplementProducts(h.db, alice)).find((p) => p.id === mag)!.stack).toBeNull();

      const logId = await logSupplement(h.db, alice, { productId: mag, date: "2026-03-12", servings: 1 });
      expect(await deleteSupplementLog(h.db, bob, logId)).toBe(false);
      expect(await deleteSupplementLog(h.db, alice, logId)).toBe(true);
    });
  });

  describe("exercise and completing a day", () => {
    it("adds and deletes exercise, scoped to the owner", async () => {
      const id = await addExercise(h.db, alice, { date: "2026-03-13", name: "Test Run", durationMin: 30, caloriesBurned: 250 });
      expect((await getDiaryDay(h.db, alice, "2026-03-13")).exercise).toEqual([
        { id, name: "Test Run", durationMin: 30, caloriesBurned: 250 },
      ]);
      expect(await deleteExercise(h.db, bob, id)).toBe(false);
      expect(await deleteExercise(h.db, alice, id)).toBe(true);
    });

    it("accepts exercise without a duration and rejects nonsense", async () => {
      await addExercise(h.db, alice, { date: "2026-03-13", name: "Test Walk", durationMin: null, caloriesBurned: 0 });
      const bad = { date: "2026-03-13", name: "Test", durationMin: null, caloriesBurned: 10 };
      await expect(addExercise(h.db, alice, { ...bad, caloriesBurned: -1 })).rejects.toBeInstanceOf(InputError);
      await expect(addExercise(h.db, alice, { ...bad, caloriesBurned: 1e6 })).rejects.toBeInstanceOf(InputError);
      await expect(addExercise(h.db, alice, { ...bad, durationMin: 0 })).rejects.toBeInstanceOf(InputError);
      await expect(addExercise(h.db, alice, { ...bad, name: "" })).rejects.toBeInstanceOf(InputError);
    });

    it("marks a day complete idempotently, re-opens it, and keeps users separate", async () => {
      const d = "2026-03-14";
      expect((await getDiaryDay(h.db, alice, d)).complete).toBe(false);
      await setDayComplete(h.db, alice, d, true);
      await setDayComplete(h.db, alice, d, true); // no error, no duplicate
      expect((await getDiaryDay(h.db, alice, d)).complete).toBe(true);
      expect((await getDiaryDay(h.db, bob, d)).complete).toBe(false);
      await setDayComplete(h.db, alice, d, false);
      expect((await getDiaryDay(h.db, alice, d)).complete).toBe(false);
    });
  });

  describe("targets", () => {
    it("saves, overrides and resets a user's own targets", async () => {
      await saveTargets(h.db, bob, { vit_c: { target: 200, upperLimit: 1000 } });
      expect(await getTargetOverrides(h.db, bob)).toEqual({ vit_c: { target: 200, upperLimit: 1000 } });
      await saveTargets(h.db, bob, { vit_c: { target: 150, upperLimit: null } }); // upsert
      expect(await getTargetOverrides(h.db, bob)).toEqual({ vit_c: { target: 150, upperLimit: null } });
      expect(await getTargetOverrides(h.db, alice)).toEqual({});
      await resetTargets(h.db, bob, ["vit_c", "not_a_nutrient"]);
      expect(await getTargetOverrides(h.db, bob)).toEqual({});
    });

    it("rejects invalid targets", async () => {
      await expect(saveTargets(h.db, bob, { nope: { target: 1, upperLimit: null } })).rejects.toBeInstanceOf(InputError);
      await expect(saveTargets(h.db, bob, { vit_c: { target: -1, upperLimit: null } })).rejects.toBeInstanceOf(InputError);
      await expect(saveTargets(h.db, bob, { vit_c: { target: 1, upperLimit: 0 } })).rejects.toBeInstanceOf(InputError);
    });

    it("turns a calorie goal and macro split into gram targets", async () => {
      const carol = await makeUser(h, "carol@example.com");
      await saveCalorieGoal(h.db, carol, 1600, { protein: 30, carbs: 40, fat: 30 });
      const t = await getTargetOverrides(h.db, carol);
      expect(t.energy_kcal!.target).toBe(1600);
      expect(t.protein!.target).toBeCloseTo(120); // 1600 * 0.30 / 4
      expect(t.carbs!.target).toBeCloseTo(160); // 1600 * 0.40 / 4
      expect(t.fat!.target).toBeCloseTo(53.333, 2); // 1600 * 0.30 / 9
    });

    it("rejects a split that does not add to 100 and an absurd goal", async () => {
      await expect(saveCalorieGoal(h.db, bob, 2000, { protein: 30, carbs: 30, fat: 30 })).rejects.toBeInstanceOf(InputError);
      await expect(saveCalorieGoal(h.db, bob, 50, { protein: 30, carbs: 40, fat: 30 })).rejects.toBeInstanceOf(InputError);
      expect(await getTargetOverrides(h.db, bob)).toEqual({}); // nothing half-saved
    });
  });

  describe("loadDay: the whole day end to end", () => {
    it("builds the summary from real rows", async () => {
      const dave = await makeUser(h, "dave@example.com");
      const day = "2026-04-01";
      const foodId = await createCustomFood(h.db, dave, {
        name: "Test Cereal",
        servingLabel: "1 bowl",
        servingGrams: 50,
        perServing: { energy_kcal: 200, protein: 10, carbs: 30, fat: 5, vit_d: 5 },
      });
      const servingId = (await getFood(h.db, dave, foodId))!.servings[0]!.id;
      await logFood(h.db, dave, { date: day, meal: "breakfast", foodId, servingId, quantity: 2 });
      const d3 = await createSupplementProduct(h.db, dave, { name: "Test D3", servingLabel: "1 capsule", perServing: { vit_d: 10 } });
      await logSupplement(h.db, dave, { productId: d3, date: day, servings: 1 });
      await addExercise(h.db, dave, { date: day, name: "Test Run", durationMin: 30, caloriesBurned: 250 });

      const { summary } = await loadDay(h.db, dave, day);

      // energy: 2 bowls = 400 kcal eaten, 250 burned, default 2000 goal
      expect(summary.energy).toMatchObject({ goal: 2000, eaten: 400, burned: 250, net: 150, budget: 2250, remaining: 1850 });
      expect(summary.meals.find((m) => m.meal === "breakfast")).toMatchObject({ items: 1, kcal: 400 });
      expect(summary.macros.find((m) => m.key === "protein")).toMatchObject({ grams: 20, percentOfTarget: 40, status: "low" });

      // vitamin D: 10 from food + 10 from the capsule = 20 = target. Supplements closed the gap.
      const vitD = summary.nutrients.find((n) => n.key === "vit_d")!;
      expect(vitD).toMatchObject({ fromFood: 10, fromSupplements: 10, amount: 20, status: "good", supplementAssist: true });
      expect(summary.groups.supplementAssist.map((r) => r.key)).toEqual(["vit_d"]);

      // nothing logged reports vitamin C, so it is unknown, not a deficiency
      expect(summary.nutrients.find((n) => n.key === "vit_c")!.status).toBe("no_data");
      expect(summary.groups.low.map((r) => r.key)).not.toContain("vit_c");

      expect(summary.isEmpty).toBe(false);
      expect(summary.complete).toBe(false);
    });

    it("applies the user's own calorie goal and reports completion", async () => {
      const erin = await makeUser(h, "erin@example.com");
      await saveCalorieGoal(h.db, erin, 1500, { protein: 25, carbs: 50, fat: 25 });
      await setDayComplete(h.db, erin, "2026-04-02", true);
      const { summary } = await loadDay(h.db, erin, "2026-04-02");
      expect(summary.energy.goal).toBe(1500);
      expect(summary.complete).toBe(true);
      expect(summary.isEmpty).toBe(true);
    });

    it("a brand-new user's empty day has no foods, supplements or exercise", async () => {
      const frank = await makeUser(h, "frank@example.com");
      const { day, summary } = await loadDay(h.db, frank, "2026-04-03");
      expect(day.entries).toEqual([]);
      expect(summary.isEmpty).toBe(true);
      expect(summary.score.total).toBe(0);
    });
  });

  describe("the built-in local user", () => {
    it("is created once and then reused", async () => {
      const a = await ensureLocalUser(h.db);
      const b = await ensureLocalUser(h.db);
      expect(a.id).toBe(b.id);
      expect(a.timezone).toBe("UTC");
    });

    it("the nutrients table is what the queries key on", async () => {
      expect((await h.db.select().from(nutrients)).length).toBeGreaterThan(40);
    });
  });
});
