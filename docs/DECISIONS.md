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

### Food data: curated USDA datasets in bulk, Open Food Facts one product at a time
USDA SR Legacy and Foundation are imported once (about 8,200 foods, public domain, curated), because
this product's premise is verified data. Open Food Facts is crowd-sourced, so it is used only when
someone looks up a barcode, stored on first use, never imported in bulk. Packaged-food data we have
no source for is entered from the label. What shaped the importer, all from the real files:
- Releases are **pinned**, not "latest": USDA published a Foundation archive missing its main
  tables. Archives are validated and the importer aborts with a clear message.
- Nutrient numbers are **re-verified against each dataset's own table on every run**, and the run
  aborts on a mismatch, so a renumbering cannot silently store wrong values.
- Only real foods are imported (469 of Foundation's 87,990 rows). Energy falls back to Atwater
  values, then to an estimate from macros. Foods with no energy and no macros are skipped, since
  logging them would silently count 0 kcal.
- **Re-importing never deletes servings.** Diary entries reference them with `ON DELETE SET NULL`,
  so deleting one would turn "2 x 1 cup" into "2 grams". Existing servings are updated by label.
- Every imported value was compared with the source CSVs by an independent implementation: all
  276,507 values identical.
- Search ranks foods containing all the words (whole words, plurals allowed), then raw over processed,
  then words in the first two parts of the name ("Fish, salmon, ..."), because USDA names read
  "category, item, qualifiers". A plain "starts with" rule put Eggnog above eggs.
- Duplicate names across datasets (SR Legacy and Foundation both publish "Broccoli, raw") are
  labelled with their dataset, and Foundation wins an exact tie.
Licensing and verification details: [PRODUCT](PRODUCT.md#data-sources--licensing).

## Open

### Auth (undecided)
Options:
- **Auth.js** with a Postgres adapter: works with any host, keeps users in our own database.
- **Supabase Auth**: least code if we host on Supabase, but ties the app to it.

Leaning Auth.js unless we choose Supabase for hosting. `users` is an app-owned table either way.

### Hosting (undecided)
Likely Vercel for Next.js plus a managed Postgres (Neon or Supabase). Nothing in the code
depends on the choice; `DATABASE_URL` is the only coupling.

### Food search
Plain `ilike` with a computed ranking is fast enough (13 ms median, 46 ms worst over 8,200 foods).
Revisit `pg_trgm` if the catalogue reaches the hundreds of thousands, or if typo tolerance matters.
Known rough edges: USDA's first-listed portion is the default ("1 cup, mashed" for bananas, not "1
medium"), and some foods appear twice because USDA publishes duplicate Foundation entries.
