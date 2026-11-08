# Data model

Source of truth: [`src/db/schema.ts`](../src/db/schema.ts). Migrations live in
[`drizzle/`](../drizzle).

```mermaid
erDiagram
  users ||--o{ diary_entries : logs
  users ||--o{ supplement_logs : takes
  users ||--o{ diary_days : "completes"
  users ||--o{ exercise_entries : "burns"
  users ||--o{ user_supplements : "stack"
  users ||--o{ nutrition_targets : sets
  users ||--o{ foods : "owns custom"
  users ||--o{ supplement_products : "owns custom"

  foods ||--o{ food_nutrients : has
  foods ||--o{ food_servings : "named portions"
  foods ||--o{ diary_entries : "eaten as"
  food_servings ||--o{ diary_entries : "measured by"

  supplement_products ||--o{ supplement_nutrients : has
  supplement_products ||--o{ supplement_logs : "taken as"
  supplement_products ||--o{ user_supplements : "in stack"

  nutrients ||--o{ food_nutrients : measures
  nutrients ||--o{ supplement_nutrients : measures
  nutrients ||--o{ nutrition_targets : "goal for"
```

## Tables

| Table | Purpose |
| --- | --- |
| `users` | Account, timezone, unit system, sex / birth date / height (for future personalised targets) |
| `nutrients` | Catalogue of trackable nutrients, seeded from `nutrient-catalog.ts` |
| `foods` | Foods. `owner_id` null = shared/imported, set = a user's custom food. Imported foods carry `source` (`usda`, `off`), `source_id` (USDA FDC id or barcode, unique per source) and `dataset` (`sr_legacy`, `foundation`) |
| `food_nutrients` | Nutrient amounts **per 100 g** |
| `food_servings` | Named portions with a gram weight; at most one default per food |
| `diary_entries` | One logged food: date, meal, quantity, resolved grams |
| `supplement_products` | A supplement and its serving label ("1 capsule") |
| `supplement_nutrients` | Nutrient amounts **per serving** |
| `user_supplements` | A user's regular stack (servings per dose, timing, active) |
| `supplement_logs` | One dose taken |
| `diary_days` | A day the user marked complete. A row exists only for completed days; deleting it re-opens the day |
| `exercise_entries` | Exercise on a day: name, optional minutes, calories burned |
| `nutrition_targets` | A user's per-nutrient daily target and optional upper limit |

## Decisions baked into the schema

- **Foods per 100 g, supplements per serving.** Food data sources (USDA, Open Food Facts) are
  per 100 g. A capsule has no meaningful gram weight, so supplements use per-serving amounts.
  Both feed the same `nutrients` catalogue, so they add up directly.
- **`entry_date` is a local calendar `date`**, not a timestamp, so "today" means the user's
  today. `logged_at` / `taken_at` record the real instant.
- **Diary rows store resolved `grams`.** Editing or deleting a serving later does not change
  what you logged. Nutrient values are still looked up live, so correcting a food's data
  corrects history too, which is how Cronometer behaves.
- **Doubles for amounts.** Nutrient data is measured, not money, so `double precision` is fine
  and avoids string conversion in JS.
- **Check constraints** keep amounts non-negative and quantities/grams positive.
- **Unknown is not zero.** A nutrient a food does not report has *no row* in `food_nutrients`. A
  food entered with only calories and macros therefore leaves vitamins unknown, and the summary
  reports them as "no data" rather than as a deficiency. An explicit `0` is real data.
- **Custom foods are entered per serving, stored per 100 g.** Labels print per-serving values, so
  the app converts using the serving's weight. If calories are missing but macros are given, calories
  are estimated from the macros (4/4/9 kcal per gram) so day totals stay consistent.
- **Reference values live in the catalogue, not the database.** A nutrient's direction (goal, limit
  or budget) and its upper limit are in `src/db/nutrient-catalog.ts` and read from there, so
  correcting one needs no migration. The `nutrients` table is seeded from the catalogue and gives
  nutrients their ids; it also has a `daily_value` column that is seeded but **not read by the app**
  (the catalogue is). A user's own targets (`nutrition_targets`) override the catalogue values.
- **Upper limits have a scope.** `total` compares food + supplements; `supplements` compares
  supplements only, for limits defined for supplemental intake (magnesium, niacin, vitamin E).
- **Exercise stays minimal on purpose.** The gym tracker will add its own workout tables rather than
  stretch this one.
- **Imported foods are matched by `(source, source_id)`.** Re-running an importer updates names and
  replaces nutrient amounts, and never deletes servings, because diary entries reference them.
