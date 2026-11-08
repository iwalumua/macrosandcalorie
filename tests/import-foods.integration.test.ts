import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "../src/db/client";
import { upsertImportedFoods } from "../src/db/import-foods";
import { createCustomFood, logFood } from "../src/db/mutations";
import { countSharedFoods, findFoodByBarcode, getDiaryDay, getFood, searchFoods } from "../src/db/queries";
import { diaryEntries, foodNutrients, foods, foodServings } from "../src/db/schema";
import type { ImportedFood } from "../src/lib/food-import";
import { makeUser, setupTestDb, TEST_DATABASE_URL } from "./helpers/test-db";

/**
 * Importing foods from an outside database, against real Postgres. All foods are
 * synthetic ("Test ...", round numbers), not real nutrition data.
 */
const food = (n: number, over: Partial<ImportedFood> = {}): ImportedFood => ({
  source: "usda",
  sourceId: String(1000 + n),
  name: `Test Import Food ${n}`,
  brand: null,
  barcode: null,
  per100g: { energy_kcal: 100 + n, protein: 10, carbs: 20, fat: 5, calcium: 30 },
  servings: [
    { label: "1 cup", grams: 100 },
    { label: "1 slice", grams: 25 },
  ],
  ...over,
});

describe.skipIf(!TEST_DATABASE_URL)("upsertImportedFoods (postgres)", () => {
  let h: DbHandle;
  let user: string;
  beforeAll(async () => {
    h = await setupTestDb();
    user = await makeUser(h, "importer@example.com");
  });
  afterAll(async () => {
    await h?.close();
  });

  it("stores foods, nutrients and servings, with the first serving as the default", async () => {
    const r = await upsertImportedFoods(h.db, [food(1)]);
    expect(r).toMatchObject({ inserted: 1, updated: 0, nutrientRows: 5, servingsInserted: 2 });

    const [hit] = await searchFoods(h.db, user, "Test Import Food 1");
    expect(hit).toMatchObject({ name: "Test Import Food 1", source: "usda", custom: false, kcalPer100g: 101 });
    const detail = (await getFood(h.db, user, hit!.id))!;
    expect(detail.per100g).toEqual({ energy_kcal: 101, protein: 10, carbs: 20, fat: 5, calcium: 30 });
    expect(detail.servings.map((s) => [s.label, s.grams, s.isDefault])).toEqual([
      ["1 cup", 100, true],
      ["1 slice", 25, false],
    ]);
    expect(detail.custom).toBe(false);
  });

  it("is safe to run twice: no duplicates, and it reports updates instead of inserts", async () => {
    await upsertImportedFoods(h.db, [food(2), food(3)]);
    const before = (await h.db.select().from(foods)).length;
    const again = await upsertImportedFoods(h.db, [food(2), food(3)]);
    expect(again).toMatchObject({ inserted: 0, updated: 2, servingsInserted: 0, servingsUpdated: 0 });
    expect((await h.db.select().from(foods)).length).toBe(before);
    expect((await h.db.select().from(foodServings)).filter((s) => s.label === "1 cup").length).toBe(3); // foods 1, 2, 3
  });

  it("replaces nutrient amounts on re-import, including removing ones the source dropped", async () => {
    await upsertImportedFoods(h.db, [food(4)]);
    await upsertImportedFoods(h.db, [food(4, { name: "Test Import Food 4 (renamed)", per100g: { energy_kcal: 999, protein: 11 } })]);
    const [hit] = await searchFoods(h.db, user, "Test Import Food 4");
    expect(hit!.name).toBe("Test Import Food 4 (renamed)");
    expect((await getFood(h.db, user, hit!.id))!.per100g).toEqual({ energy_kcal: 999, protein: 11 });
  });

  it("NEVER damages diary history: servings are kept even if a re-import drops or reweighs them", async () => {
    await upsertImportedFoods(h.db, [food(5)]);
    const [hit] = await searchFoods(h.db, user, "Test Import Food 5");
    const detail = (await getFood(h.db, user, hit!.id))!;
    const cup = detail.servings.find((s) => s.label === "1 cup")!;
    const entryId = await logFood(h.db, user, { date: "2026-05-01", meal: "lunch", foodId: hit!.id, servingId: cup.id, quantity: 2 });

    // The source now reweighs the cup and drops the slice entirely.
    const r = await upsertImportedFoods(h.db, [food(5, { servings: [{ label: "1 cup", grams: 120 }] })]);
    expect(r).toMatchObject({ servingsUpdated: 1, servingsInserted: 0 });

    const after = (await getFood(h.db, user, hit!.id))!;
    expect(after.servings.map((s) => s.label).sort()).toEqual(["1 cup", "1 slice"]); // nothing deleted
    expect(after.servings.find((s) => s.label === "1 cup")!.grams).toBe(120);

    const [entry] = await h.db.select().from(diaryEntries).where(eq(diaryEntries.id, entryId));
    expect(entry!.servingId).toBe(cup.id); // still points at the same serving, not nulled
    expect(entry!.grams).toBe(200); // the amount eaten is what was logged, not retroactively changed
    const day = await getDiaryDay(h.db, user, "2026-05-01");
    expect(day.entries[0]).toMatchObject({ quantity: 2, servingLabel: "1 cup" });
  });

  it("keeps the existing default serving and adds new labels as non-default", async () => {
    await upsertImportedFoods(h.db, [food(6)]);
    await upsertImportedFoods(h.db, [food(6, { servings: [{ label: "1 tablespoon", grams: 10 }, { label: "1 cup", grams: 100 }] })]);
    const [hit] = await searchFoods(h.db, user, "Test Import Food 6");
    const servings = (await getFood(h.db, user, hit!.id))!.servings;
    expect(servings.filter((s) => s.isDefault).map((s) => s.label)).toEqual(["1 cup"]);
    expect(servings.find((s) => s.label === "1 tablespoon")).toMatchObject({ grams: 10, isDefault: false });
  });

  it("matches by source and id: the same id from another source is a different food", async () => {
    await upsertImportedFoods(h.db, [food(7)]); // USDA id 1007
    await upsertImportedFoods(h.db, [food(7, { source: "off", sourceId: "1007", barcode: "1007" })]); // Open Food Facts code 1007
    const sameId = (await h.db.select().from(foods)).filter((f) => f.sourceId === "1007");
    expect(sameId.map((f) => f.source).sort()).toEqual(["off", "usda"]);
  });

  it("handles batches larger than the batch size", async () => {
    const many = Array.from({ length: 1203 }, (_, i) => food(2000 + i));
    const progress: number[] = [];
    const r = await upsertImportedFoods(h.db, many, { batchSize: 500, onProgress: (d) => progress.push(d) });
    expect(r.inserted).toBe(1203);
    expect(r.nutrientRows).toBe(1203 * 5);
    expect(progress).toEqual([500, 1000, 1203]);
    const stored = (await h.db.select().from(foods)).filter((f) => f.sourceId !== null && Number(f.sourceId) >= 3000);
    expect(stored.length).toBe(1203); // ids 3000..4202, none lost at a batch boundary
  });

  it("leaves a user's own custom foods alone", async () => {
    const id = await createCustomFood(h.db, user, { name: "Test My Own Bar", servingLabel: "1 bar", servingGrams: 40, perServing: { energy_kcal: 100 } });
    const before = await getFood(h.db, user, id);
    await upsertImportedFoods(h.db, [food(8)]);
    expect(await getFood(h.db, user, id)).toEqual(before);
  });

  it("shared imported foods are visible to every user", async () => {
    const other = await makeUser(h, "other@example.com");
    expect((await searchFoods(h.db, other, "Test Import Food 1")).some((f) => f.name === "Test Import Food 1")).toBe(true);
  });

  it("imports nothing, harmlessly, for an empty list", async () => {
    expect(await upsertImportedFoods(h.db, [])).toEqual({ inserted: 0, updated: 0, nutrientRows: 0, servingsInserted: 0, servingsUpdated: 0 });
  });

  it("ignores nutrient keys the database does not know instead of failing the whole import", async () => {
    await upsertImportedFoods(h.db, [food(9, { per100g: { energy_kcal: 50, not_a_nutrient: 1 } })]);
    const [hit] = await searchFoods(h.db, user, "Test Import Food 9");
    expect((await getFood(h.db, user, hit!.id))!.per100g).toEqual({ energy_kcal: 50 });
    expect((await h.db.select().from(foodNutrients).where(eq(foodNutrients.foodId, hit!.id))).length).toBe(1);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("barcode lookup and food source (postgres)", () => {
  let h: DbHandle;
  let user: string;
  beforeAll(async () => {
    h = await setupTestDb();
    user = await makeUser(h, "barcode@example.com");
  });
  afterAll(async () => {
    await h?.close();
  });

  it("finds a stored food by barcode, so a second lookup needs no network call", async () => {
    expect(await findFoodByBarcode(h.db, user, "12345670")).toBeNull();
    await upsertImportedFoods(h.db, [
      { source: "off", sourceId: "12345670", name: "Test Cocoa Spread", brand: "Test Brand", barcode: "12345670", per100g: { energy_kcal: 500 }, servings: [] },
    ]);
    const id = await findFoodByBarcode(h.db, user, "12345670");
    expect(id).not.toBeNull();
    const detail = (await getFood(h.db, user, id!))!;
    expect(detail).toMatchObject({ name: "Test Cocoa Spread", source: "off", custom: false, servings: [] });
    expect(await findFoodByBarcode(h.db, user, "99999999")).toBeNull();
  });

  it("reports where a food came from", async () => {
    await upsertImportedFoods(h.db, [food(1)]);
    const [usda] = await searchFoods(h.db, user, "Test Import Food 1");
    expect((await getFood(h.db, user, usda!.id))!.source).toBe("usda");
    const mine = await createCustomFood(h.db, user, { name: "Test Mine", servingLabel: "1", servingGrams: 10, perServing: { energy_kcal: 10 } });
    expect((await getFood(h.db, user, mine))!.source).toBe("custom");
  });

  it("counts shared foods, so an empty database can be explained", async () => {
    const n = await countSharedFoods(h.db);
    expect(n).toBeGreaterThanOrEqual(2);
    await createCustomFood(h.db, user, { name: "Test Another Of Mine", servingLabel: "1", servingGrams: 10, perServing: { energy_kcal: 10 } });
    expect(await countSharedFoods(h.db)).toBe(n); // a user's own food is not "shared"
  });
});

describe.skipIf(!TEST_DATABASE_URL)("search ranking and datasets (postgres)", () => {
  let h: DbHandle;
  let user: string;
  // USDA puts the main noun first ("Egg, whole, raw"). Names here mimic that shape with synthetic "Test" prefixes.
  const names = [
    "Zork Test Eggnog",
    "Zork Test Eggplant, raw",
    "Zork Test Egg, whole, raw",
    "Zork Test Eggs, scrambled",
    "Zork Test Yogurt, plain, whole milk",
    "Zork Test Milk, whole, 3% fat",
    "ZORKBEE'S Test Chili",
    "Zork Test Apples, raw",
    "Zork Test Broccoli, raw",
    "Zork Test Egg, yolk, dried",
    "Zork Test Cheese, melted",
    "Zork Test Cheese, melted, raw",
    "Zork Test Fish, salmon, raw",
    "Zork Test Salmon nuggets, breaded, frozen",
  ];
  beforeAll(async () => {
    h = await setupTestDb();
    user = await makeUser(h, "ranker@example.com");
    await upsertImportedFoods(
      h.db,
      names.map((name, i) => food(i, { name, sourceId: `r${i}`, dataset: "sr_legacy", per100g: { energy_kcal: 100 } })),
    );
    // The same name published twice: the newer Foundation analysis should win a tie.
    await upsertImportedFoods(h.db, [food(50, { name: "Zork Test Broccoli, raw", sourceId: "r50", dataset: "foundation", per100g: { energy_kcal: 90 } })]);
  });
  afterAll(async () => {
    await h?.close();
  });

  const top = async (q: string, n = 3) => (await searchFoods(h.db, user, q)).slice(0, n).map((f) => f.name);

  it("ranks the food over longer words that merely start with the query ('egg' before 'eggnog')", async () => {
    const r = await top("zork egg", 4);
    expect(r.slice(0, 2).sort()).toEqual(["Zork Test Egg, whole, raw", "Zork Test Eggs, scrambled"]);
    expect(r.slice(2)).toEqual(expect.arrayContaining([expect.stringMatching(/Eggnog|Eggplant/)]));
  });

  it("counts the head of the name most: 'whole milk' finds Milk, whole before yogurt made with whole milk", async () => {
    expect((await top("zork whole milk", 1))[0]).toBe("Zork Test Milk, whole, 3% fat");
  });

  it("prefers the raw form of a food over dried or processed ones, but not when the search asks for them", async () => {
    expect((await top("zork egg", 1))[0]).toBe("Zork Test Egg, whole, raw"); // not the shorter "Egg, yolk, dried"
    expect((await top("zork egg dried", 1))[0]).toBe("Zork Test Egg, yolk, dried"); // asked for dried: it wins
    expect((await top("zork cheese", 1))[0]).toBe("Zork Test Cheese, melted, raw"); // raw beats the shorter name
  });

  it("recognises USDA's 'category, item' naming: 'Fish, salmon, raw' beats 'Salmon nuggets, breaded'", async () => {
    expect((await top("zork salmon", 1))[0]).toBe("Zork Test Fish, salmon, raw");
  });

  it("matches plurals both ways ('apple' finds Apples)", async () => {
    expect((await top("zork apple", 1))[0]).toBe("Zork Test Apples, raw");
  });

  it("still finds foods where the query is only part of a word, just ranked lower", async () => {
    expect(await top("zork eggplant", 1)).toEqual(["Zork Test Eggplant, raw"]);
    expect((await top("zorkbee", 1))[0]).toBe("ZORKBEE'S Test Chili");
  });

  it("on an exact tie prefers the newer Foundation data, and labels where each came from", async () => {
    const hits = (await searchFoods(h.db, user, "zork broccoli")).filter((f) => f.name === "Zork Test Broccoli, raw");
    expect(hits.map((f) => f.dataset)).toEqual(["foundation", "sr_legacy"]);
  });

  it("treats user text as text: regex and LIKE characters cannot change the query", async () => {
    for (const evil of ["(", ")", "\\", "[a-", ".*", "a{2", "%", "_", "\\m", "'; drop table foods; --"]) {
      await expect(searchFoods(h.db, user, evil)).resolves.toBeDefined();
    }
    expect((await h.db.select().from(foods)).length).toBeGreaterThan(5); // the table is still there
  });
});
