# Decisions

Short records of choices made, and the ones still open.

## Decided

### Model the product on Cronometer
Verified food data, deep micronutrient tracking and supplements as first-class matter more here
than MyFitnessPal's database size. See [PRODUCT](PRODUCT.md#why-cronometer-not-myfitnesspal).

### TypeScript, Next.js, PostgreSQL, Drizzle ORM
- One language across UI, API and data access.
- Postgres fits the relational model and gives us `pg_trgm` for food search.
- Drizzle keeps the schema in TypeScript and emits plain SQL migrations we can read and review.
  It is a thin layer over SQL, which suits the aggregate queries this app needs.

### Nutrients referenced by key in code, by id in the database
`NUTRIENT_CATALOG` is the one place nutrients are defined. Code uses stable string keys
(`"vit_d"`); the database uses integer ids.

### Generic Daily Values as the initial targets
The FDA adult Daily Values ship as defaults. They are generic and labelled as such until
Phase 3 adds age/sex-specific reference intakes.

### Mobile-first web app (PWA) now, native Android when the fitness phase needs it
Build and test on Windows in the browser, with a phone layout, now. Revisit native when the gym
tracker needs offline logging, rest timers or wearable data. Full reasoning and the options in
[PLATFORM](PLATFORM.md).

### Next.js server actions over a data layer, not a JSON API (for now)
Screens call `src/db/queries.ts` and `src/db/mutations.ts` through server components and server
actions. Logic stays out of components so a JSON API can be added over the same layer if a native
client appears. Every mutation is scoped to the user id and validates its input, because server
actions are public endpoints.

### Single built-in user until auth is chosen
Every request acts as one user (`src/server/context.ts`). To stop this being deployed openly by
mistake, production refuses to run unless `SINGLE_USER_MODE=true`. This is a stopgap, not a
decision about auth; see Open below.

### "Complete day" marks a day, it does not lock it
A completed day is a signal for the summary and future trends (ignore half-logged days). Entries stay
editable and the day can be re-opened, matching Cronometer's behaviour.

### Unknown is not zero
A nutrient with no data is reported as "no data", never as a 0% deficiency, and is excluded from
the "targets met" count. Otherwise a food entered with only calories and macros would make every
vitamin look missing.

### Upper limits compare against the right basis
Limits defined for supplements (magnesium, niacin, vitamin E) are checked against supplement
intake only. Vitamin A and folate limits are deliberately left out: their limits apply to preformed
retinol and synthetic folic acid, which the tracked values (RAE, DFE) cannot separate.

### Exercise is a minimal calorie entry for now
Name, optional minutes and calories burned, so the Day Summary can show energy out. The gym tracker
(Phase 5) gets its own tables. Calories burned are typed in, not estimated.

### Targets resolve from the catalogue, overridden by the user
Generic FDA Daily Values by default; a user target replaces one nutrient. Saving the targets form
stores only the rows the user changed, so improving a default later still reaches everyone who did
not customise it.

## Open

### Food data (the biggest gap)
There is no food database yet, so foods are entered from labels. Plan: import USDA FoodData
Central (public domain) for verified foods. Before building on it, the `usdaNumber` mappings in
the catalogue must be checked against FDC, and a development environment needs network access to
`api.nal.usda.gov` or the bulk downloads on `fdc.nal.usda.gov`.

### Auth (undecided)
Options:
- **Auth.js** with a Postgres adapter: works with any host, keeps users in our own database.
- **Supabase Auth**: least code if we host on Supabase, but ties the app to it.

Leaning Auth.js unless we choose Supabase for hosting. `users` is an app-owned table either way.

### Hosting (undecided)
Likely Vercel for Next.js plus a managed Postgres (Neon or Supabase). Nothing in the code
depends on the choice; `DATABASE_URL` is the only coupling.

### Food search
`pg_trgm` trigram index on food name/brand is planned for Phase 1. Revisit if relevance is poor.
