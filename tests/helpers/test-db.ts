import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb, type DbHandle } from "../../src/db/client";
import { NUTRIENT_CATALOG } from "../../src/db/nutrient-catalog";
import { nutrients, users } from "../../src/db/schema";

/** The Postgres database integration tests run against, or undefined to skip them. */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/**
 * Wipe the test database, run the real migrations and load the nutrient
 * catalogue. Refuses to touch any database whose name does not end in "_test".
 */
export async function setupTestDb(): Promise<DbHandle> {
  const url = TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!dbName.endsWith("_test")) {
    throw new Error(`Refusing to wipe "${dbName}": TEST_DATABASE_URL must point at a *_test database.`);
  }
  const handle = createDb(url);
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
  return handle;
}

/** Insert a user and return its id. */
export async function makeUser(handle: DbHandle, email: string): Promise<string> {
  const [u] = await handle.db.insert(users).values({ email }).returning({ id: users.id });
  return u!.id;
}
