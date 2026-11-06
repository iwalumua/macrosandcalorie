import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  /** Close the underlying connection pool. */
  close: () => Promise<void>;
}

export function createDb(url: string | undefined = process.env.DATABASE_URL): DbHandle {
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and adjust it.");
  }
  const client = postgres(url, { max: 10 });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end(),
  };
}

// Reuse one pool across hot reloads in `next dev`.
const globalForDb = globalThis as unknown as { __db?: DbHandle };

export function getDb(): Database {
  globalForDb.__db ??= createDb();
  return globalForDb.__db.db;
}
