import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client";

/** Apply pending SQL migrations from ./drizzle. Run with `npm run db:migrate`. */
async function main() {
  const { db, close } = createDb();
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("Migrations applied.");
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
