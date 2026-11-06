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
`pg_trgm` trigram index on food name/brand is planned for Phase 1. Revisit if relevance is poor.
