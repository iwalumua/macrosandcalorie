import { sql } from "drizzle-orm";
import { createDb } from "./client";
import { NUTRIENT_CATALOG } from "./nutrient-catalog";
import { nutrients } from "./schema";

/** Upsert the nutrient catalogue. Safe to re-run. Run with `npm run db:seed`. */
async function main() {
  const { db, close } = createDb();
  try {
    await db
      .insert(nutrients)
      .values(
        NUTRIENT_CATALOG.map((n) => ({
          key: n.key,
          name: n.name,
          unit: n.unit,
          category: n.category,
          usdaNumber: n.usdaNumber ?? null,
          dailyValue: n.dailyValue ?? null,
        })),
      )
      .onConflictDoUpdate({
        target: nutrients.key,
        set: {
          name: sql`excluded.name`,
          unit: sql`excluded.unit`,
          category: sql`excluded.category`,
          usdaNumber: sql`excluded.usda_number`,
          dailyValue: sql`excluded.daily_value`,
        },
      });
    console.log(`Seeded ${NUTRIENT_CATALOG.length} nutrients.`);
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
