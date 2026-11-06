import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "../src/db/client";
import { NUTRIENT_CATALOG } from "../src/db/nutrient-catalog";
import { getDailyTotals } from "../src/db/queries";
import {
  diaryEntries,
  foodNutrients,
  foods,
  foodServings,
  nutrients,
  supplementLogs,
  supplementNutrients,
  supplementProducts,
  users,
} from "../src/db/schema";

/**
 * Runs the real migrations against a throwaway Postgres database, then checks
 * the daily-totals query end to end. Skipped unless TEST_DATABASE_URL is set.
 * The target database is WIPED, so its name must end in "_test".
 */
const url = process.env.TEST_DATABASE_URL;
const dbName = url ? new URL(url).pathname.replace(/^\//, "") : "";

describe.skipIf(!url)("getDailyTotals (postgres)", () => {
  let handle: DbHandle;

  beforeAll(async () => {
    if (!dbName.endsWith("_test")) {
      throw new Error(`Refusing to wipe "${dbName}": TEST_DATABASE_URL must point at a *_test database.`);
    }
    handle = createDb(url);
    const { db } = handle;
    await db.execute(sql`drop schema if exists public cascade`);
    await db.execute(sql`drop schema if exists drizzle cascade`);
    await db.execute(sql`create schema public`);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await db.insert(nutrients).values(
      NUTRIENT_CATALOG.map((n) => ({
        key: n.key,
        name: n.name,
        unit: n.unit,
        category: n.category,
        usdaNumber: n.usdaNumber ?? null,
        dailyValue: n.dailyValue ?? null,
      })),
    );
  });

  afterAll(async () => {
    await handle?.close();
  });

  it("sums foods and supplements for one user and one day", async () => {
    const { db } = handle;
    const ids = Object.fromEntries(
      (await db.select({ id: nutrients.id, key: nutrients.key }).from(nutrients)).map((n) => [n.key, n.id]),
    );

    const [alice, bob] = await db
      .insert(users)
      .values([{ email: "alice@example.com" }, { email: "bob@example.com" }])
      .returning();

    // Synthetic fixtures with round numbers, not real nutrition data.
    const [oats, milk] = await db
      .insert(foods)
      .values([{ name: "Test oats" }, { name: "Test milk" }])
      .returning();
    await db.insert(foodNutrients).values([
      { foodId: oats!.id, nutrientId: ids.protein!, amountPer100g: 10 },
      { foodId: oats!.id, nutrientId: ids.carbs!, amountPer100g: 60 },
      { foodId: milk!.id, nutrientId: ids.protein!, amountPer100g: 3 },
      { foodId: milk!.id, nutrientId: ids.calcium!, amountPer100g: 120 },
    ]);
    const [cup] = await db
      .insert(foodServings)
      .values({ foodId: milk!.id, label: "1 cup", grams: 240, isDefault: true })
      .returning();

    const day = "2026-03-10";
    await db.insert(diaryEntries).values([
      { userId: alice!.id, entryDate: day, meal: "breakfast", foodId: oats!.id, quantity: 50, grams: 50 },
      { userId: alice!.id, entryDate: day, meal: "breakfast", foodId: milk!.id, servingId: cup!.id, quantity: 1, grams: 240 },
      // Different day and different user: must not be counted.
      { userId: alice!.id, entryDate: "2026-03-11", meal: "lunch", foodId: oats!.id, quantity: 100, grams: 100 },
      { userId: bob!.id, entryDate: day, meal: "lunch", foodId: oats!.id, quantity: 100, grams: 100 },
    ]);

    const [d3] = await db.insert(supplementProducts).values({ name: "Test D3", servingLabel: "1 capsule" }).returning();
    await db.insert(supplementNutrients).values([
      { productId: d3!.id, nutrientId: ids.vit_d!, amountPerServing: 25 },
      { productId: d3!.id, nutrientId: ids.calcium!, amountPerServing: 100 },
    ]);
    await db.insert(supplementLogs).values([
      { userId: alice!.id, productId: d3!.id, entryDate: day, servings: 2 },
      { userId: bob!.id, productId: d3!.id, entryDate: day, servings: 1 },
    ]);

    const totals = await getDailyTotals(db, alice!.id, day);

    // foods: 50 g oats -> 5 g protein, 30 g carbs; 240 g milk -> 7.2 g protein, 288 mg calcium
    expect(totals.foods.protein).toBeCloseTo(12.2);
    expect(totals.foods.carbs).toBeCloseTo(30);
    expect(totals.foods.calcium).toBeCloseTo(288);
    // supplements: 2 capsules -> 50 mcg vitamin D, 200 mg calcium
    expect(totals.supplements.vit_d).toBeCloseTo(50);
    expect(totals.supplements.calcium).toBeCloseTo(200);
    // total combines both sources
    expect(totals.total.calcium).toBeCloseTo(488);
    expect(totals.total.vit_d).toBeCloseTo(50);
    expect(totals.total.protein).toBeCloseTo(12.2);
  });

  it("returns empty totals for a day with nothing logged", async () => {
    const [carol] = await handle.db.insert(users).values({ email: "carol@example.com" }).returning();
    const totals = await getDailyTotals(handle.db, carol!.id, "2026-03-10");
    expect(totals).toEqual({ foods: {}, supplements: {}, total: {} });
  });

  it("enforces at most one default serving per food", async () => {
    const [f] = await handle.db.insert(foods).values({ name: "Default serving test" }).returning();
    await handle.db.insert(foodServings).values({ foodId: f!.id, label: "a", grams: 10, isDefault: true });
    await expect(
      handle.db.insert(foodServings).values({ foodId: f!.id, label: "b", grams: 20, isDefault: true }),
    ).rejects.toThrow();
  });
});
