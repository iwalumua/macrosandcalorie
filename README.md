# Macros & Calorie

A daily tracker for **calories, macros, micronutrients and supplements**, modelled on
[Cronometer](https://cronometer.com): log what you eat and take, and see exactly how the day
measures up against your nutrient targets.

> **Status: scaffold.** The database schema, nutrition maths and project tooling are in place and
> tested. The user-facing features (diary, supplements, targets) are not built yet. See the
> [roadmap](docs/PRODUCT.md#roadmap).

## Stack

- **TypeScript** end to end
- **Next.js** (App Router) + React + Tailwind CSS
- **PostgreSQL 16** with **Drizzle ORM** (SQL migrations in [`drizzle/`](drizzle))
- **Vitest** for tests

## Quick start

Requires Node 22+ and a Postgres 16 database.

```bash
npm install
cp .env.example .env        # set DATABASE_URL if you are not using docker-compose
docker compose up -d        # optional: local Postgres on :5432 (also creates the _test database)
npm run db:migrate          # apply SQL migrations
npm run db:seed             # load the nutrient catalogue (safe to re-run)
npm run dev                 # http://localhost:3000, health check at /api/health
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev server / production build / serve the build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests; integration tests too when `TEST_DATABASE_URL` is set |
| `npm run db:generate` | Generate a new SQL migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations to `DATABASE_URL` |
| `npm run db:seed` | Upsert the nutrient catalogue |

### Integration tests

`tests/daily-totals.integration.test.ts` runs the real migrations and the daily-totals query
against Postgres. It **drops and recreates the `public` schema**, so it only runs against a
database whose name ends in `_test`:

```bash
TEST_DATABASE_URL=postgres://macros:macros@localhost:5432/macrosandcalorie_test npm test
```

## Project layout

```
src/app/              Next.js routes (UI + /api/health)
src/db/schema.ts      Drizzle schema: the source of truth for the database
src/db/nutrient-catalog.ts   The trackable nutrients (seeded into the DB)
src/db/queries.ts     Queries (daily totals, split by food vs supplement)
src/lib/nutrition.ts  Pure nutrition maths (scaling, sums, macro split, % of target)
drizzle/              Generated SQL migrations: commit these
tests/                Vitest tests
docs/                 Product spec & roadmap, data model, decisions
```

## Docs

- [Product spec & roadmap](docs/PRODUCT.md)
- [Data model](docs/DATA_MODEL.md)
- [Decisions](docs/DECISIONS.md)

## Disclaimer

This is a tracking tool, not medical or dietary advice. Default targets are generic FDA Daily
Values, not recommendations for any individual.
