# Macros & Calorie

A daily tracker for **calories, macros, micronutrients and supplements**, modelled on
[Cronometer](https://cronometer.com): log what you eat and take, and see exactly how the day
measures up against your nutrient targets. Mobile-first, and the first part of a wider health
tracker (a gym and exercise tracker comes later).

> **Status: working app, no food database yet.** You can log foods, supplements and exercise, set
> targets, and get a Day Summary. Foods have to be entered from labels until the USDA importer is
> built. See [what is not built](#not-built-yet) and the [roadmap](docs/PRODUCT.md#roadmap).

## What it does

- **Diary** for any day: breakfast, lunch, dinner and snacks, with a calorie ring and macro bars
  (calories left = goal - food + exercise).
- **Day Summary** (tap *Summary*, or *Complete day*): calories in and out, net calories, exercise,
  macros, calories by meal, and every other nutrient against its target, grouped into *went well*,
  *almost there*, *falling short* and *over a limit*, plus which gaps your supplements closed.
- **Supplements** counted toward your nutrients: a daily stack grouped by time of day, one tap to log
  what is left, and warnings when supplements push a nutrient past its general adult upper limit.
- **Targets**: the generic FDA adult Daily Values by default (clearly labelled as generic), or your
  own calorie goal, macro split and per-nutrient targets.
- **Foods from labels**: enter a food's label values and it is stored per 100 g.
- **Exercise**: log calories burned; they raise that day's calorie budget.

## Stack

- **TypeScript** end to end
- **Next.js** (App Router, server actions) + React + Tailwind CSS, `lucide-react` icons
- **PostgreSQL 16** with **Drizzle ORM** (SQL migrations in [`drizzle/`](drizzle))
- **Vitest** for tests

## Quick start

Requires Node 22+ and a Postgres 16 database. Works the same on Windows, macOS and Linux.

```bash
npm install
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
docker compose up -d        # optional: local Postgres on :5432 (also creates the _test database)
npm run db:migrate          # apply SQL migrations
npm run db:seed             # load the nutrient catalogue (safe to re-run)
npm run dev                 # http://localhost:3000
```

To see it on a phone, see [docs/PLATFORM.md](docs/PLATFORM.md). In short, use the production build:
`npm run build`, then `SINGLE_USER_MODE=true npm start -- -H 0.0.0.0`.

### There is no login yet

Every request acts as one built-in user. That is fine on your own machine. In production the app
**refuses to run** unless `SINGLE_USER_MODE=true` is set, so it cannot be put on the internet by
accident. Do not set it on anything other people can reach. See [DECISIONS](docs/DECISIONS.md#auth-undecided).

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

`tests/*.integration.test.ts` run the real migrations and the data layer against Postgres. They
**drop and recreate the `public` schema**, so they only run against a database whose name ends in
`_test`:

```bash
TEST_DATABASE_URL=postgres://macros:macros@localhost:5432/macrosandcalorie_test npm test
```

## Project layout

```
src/app/              Next.js routes and UI (diary, summary, supplements, targets, foods, exercise)
src/app/_components/  Shared UI: calorie ring, meters, nutrient rows, date navigation, forms
src/server/           Request context (current user, local "today") and form parsing for actions
src/db/schema.ts      Drizzle schema: the source of truth for the database
src/db/nutrient-catalog.ts   The trackable nutrients, their reference values and upper limits
src/db/queries.ts     Read queries (day totals, diary, food search, supplements, targets)
src/db/mutations.ts   Writes, each scoped to the user and validated
src/db/day.ts         Loads a whole day and builds its summary
src/lib/              Pure logic, no database or framework: nutrition maths, targets,
                      the day summary, dates, formatting
drizzle/              Generated SQL migrations: commit these
tests/                Vitest tests
docs/                 Product spec & roadmap, data model, decisions, platform
```

## Not built yet

Honest list of what this does not do today:

- **No food database.** Foods are entered from labels. A USDA FoodData Central importer is next; it
  needs network access to USDA and its nutrient-number mappings must be verified first (they are
  marked unverified in the catalogue).
- **No login or multiple users.** See above.
- **Generic targets.** The defaults are the FDA adult Daily Values, not personalised by age or sex.
- **Exercise is manual:** you type the calories burned. There is no workout or gym tracking yet.
- **Online only.** No offline mode, and metric units only. No weight, water or body measurements.

## Docs

- [Product spec & roadmap](docs/PRODUCT.md)
- [Data model](docs/DATA_MODEL.md)
- [Decisions](docs/DECISIONS.md)
- [Platform: web app now, Android later](docs/PLATFORM.md)

## Disclaimer

This is a tracking tool, not medical or dietary advice. Default targets are generic FDA Daily
Values, and upper limits are general adult reference points from the NIH, not recommendations for
any individual.
