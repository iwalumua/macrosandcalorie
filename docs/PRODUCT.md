# Product spec & roadmap

## Goal

A personal daily nutrition tracker that answers one question well: **"Did I get what my body needs
today?"** That means calories and macros, but also micronutrients, and supplements counted
alongside food, which is where most trackers fall down.

## Why Cronometer, not MyFitnessPal

| | MyFitnessPal | Cronometer (our model) |
| --- | --- | --- |
| Food data | Largely crowd-sourced; many wrong or duplicate entries | Curated/verified sources |
| Micronutrients | Few, mostly paywalled | 80+ tracked, all visible |
| Supplements | Not first-class | Logged and counted toward nutrient totals |
| Focus | Calories and weight loss | Nutrient completeness |

We copy the **approach**, meaning verified data, deep nutrient tracking and supplements as
first-class, and design our own UI. We do not use Cronometer's name, branding, assets or code.

## Core concepts

- **Food**: a thing you eat, with nutrients stored **per 100 g** and named **servings**
  ("1 cup" = 240 g).
- **Diary entry**: a food eaten on a day, in a meal (breakfast / lunch / dinner / snack).
- **Supplement product**: a capsule, powder or drop with nutrients stored **per serving**.
- **Supplement log / stack**: doses you took, and your regular stack for one-tap logging.
- **Target**: your daily goal for a nutrient, with an optional upper limit.
- **Daily totals**: food + supplements for a day, compared against targets.

## Roadmap

### Phase 0: scaffold (done)
Next.js + TypeScript + Postgres project, schema and migration, nutrient catalogue (45 nutrients),
nutrition maths, daily-totals query, tests.

### Phase 1: food diary (MVP)
- Authentication (see [DECISIONS](DECISIONS.md#auth-undecided))
- USDA FoodData Central importer: nutrient mapping and portion sizes
- Food search (Postgres `pg_trgm`) and custom foods
- Diary page for a given date: four meals, add/edit/delete entries
- Daily dashboard: calories and macros vs target, micronutrients vs Daily Value

### Phase 2: supplements
- Supplement products: enter from a label, per-serving nutrients
- Your stack, with one-tap "log my morning stack"
- Daily view split by source: how much of each nutrient came from food vs supplements
- Upper-limit warnings (a stack can overshoot a nutrient even when food alone would not)

### Phase 3: targets & insights
- Personalised reference intakes by age and sex (replaces the generic FDA Daily Values)
- Calorie goal with macro % split (maths exists in `src/lib/nutrition.ts`)
- Weekly and monthly trends; "nutrient gaps" report
- Recipes (computed from ingredients), saved meals, copy a day or meal

### Phase 4: extras
- Barcode scanning via Open Food Facts
- Weight and body measurements; water
- CSV export; installable PWA

## Non-goals (for now)

Social features, meal planning, wearable integrations, a coaching or recommendation engine, and
selling or sharing user data.

## Data sources & licensing

- **USDA FoodData Central**: public domain (CC0). Primary source for verified foods.
- **Open Food Facts**: ODbL database licence. Attribution and share-alike apply, so check the
  terms before storing and redistributing its data. Planned for barcode lookups only.
- **Cronometer's database (NCCDB)** is proprietary; we do not use it.

## Safety

Nutrition targets and supplement upper limits are informational. The app must not present itself
as medical advice, and generic Daily Values must be labelled as generic.
