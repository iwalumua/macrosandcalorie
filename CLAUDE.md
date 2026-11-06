# CLAUDE.md

Cronometer-style nutrition tracker: calories, macros, micronutrients and supplements.
TypeScript, Next.js (App Router), PostgreSQL 16, Drizzle ORM, Vitest. Read `README.md` first and
`docs/PRODUCT.md` for scope and roadmap.

## Commands

- `npm run typecheck`: must pass before committing
- `npm test`: unit tests; set `TEST_DATABASE_URL` (database name must end in `_test`) to include
  the Postgres integration tests, which wipe that database
- `npm run build`: production build
- `npm run db:generate`: after editing `src/db/schema.ts`, generate a migration and commit
  everything in `drizzle/`. Never hand-edit a migration that has already been applied anywhere.
- `npm run db:migrate`, `npm run db:seed`: apply migrations / upsert the nutrient catalogue

## Conventions

- `src/db/schema.ts` is the source of truth for the database; `src/db/nutrient-catalog.ts` is the
  source of truth for which nutrients exist. Add a nutrient there, not in SQL.
- Nutrient amounts: foods **per 100 g**, supplements **per serving**. Units come from the
  catalogue (`g`, `mg`, `mcg`, `kcal`); never mix units in maths.
- Dates in the diary are the user's *local* calendar day as `YYYY-MM-DD` strings, not timestamps.
- Keep `src/lib/nutrition.ts` pure (no database or framework imports) and unit tested.
- Use relative imports in `src/db` and `src/lib` (they run under `tsx` and Vitest, which do not
  resolve the `@/` alias); `@/` is fine inside `src/app`.
- Do not put real or invented food nutrition data in fixtures presented as real. Test data must
  be obviously synthetic (round numbers, "Test ..." names).
- `usdaNumber` mappings in the catalogue are unverified; check them against FoodData Central
  before building the importer on them.
