import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` only diffs the TypeScript schema against the
// migration history, so it needs no database connection. Migrations are
// applied by `npm run db:migrate` (src/db/migrate.ts).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
