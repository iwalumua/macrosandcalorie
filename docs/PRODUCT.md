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
- **Diary day**: one local calendar day, which can be marked complete.
- **Supplement product**: a capsule, powder or drop with nutrients stored **per serving**.
- **Supplement log / stack**: doses you took, and your regular stack for one-tap logging.
- **Target**: your daily goal for a nutrient, with an optional upper limit.
- **Exercise entry**: calories burned on a day; it raises that day's calorie budget.
- **Daily totals**: food + supplements for a day, compared against targets.

## Day Summary

The end-of-day view, opened with the **Summary** button on the diary or by completing the day.

- **Complete day** marks a diary day as done, as in Cronometer. It does not lock anything:
  entries can still be edited, and the day can be re-opened. Later, trends should ignore days that
  were never completed.
- **Calories in and out:** eaten, exercise burned, net (eaten - burned), and the budget
  (goal + exercise) with what is left or over. Over or under the goal is described neutrally, since
  eating under goal can be the intention.
- **Macros:** grams against target, and each macro's share of calories.
- **By meal:** calories and macros per meal.
- **Nutrients against targets**, grouped: went well, almost there (70-99%), falling short (under
  70%, lowest first), over a limit. Limits (sodium, added sugars, saturated fat, cholesterol) are
  judged the other way round from goals.
- **Supplements helped:** goals that food alone missed and supplements closed.
- **Upper limits:** flagged when exceeded. Some limits (magnesium, niacin, vitamin E) apply to
  supplemental intake only, so food does not count toward them.
- **Unknown is not zero:** a nutrient that nothing logged reports (a custom food entered with only
  calories and macros) is shown as *not scored*, never as a deficiency, and is left out of the
  "targets met" count.

## Roadmap

### Phase 0: scaffold (done)
Next.js + TypeScript + Postgres project, schema and migration, nutrient catalogue (45 nutrients),
nutrition maths, daily-totals query, tests.

### Phase 1: food diary (mostly done)
- [x] Diary page for a given date: four meals, add/edit/delete entries
- [x] Daily dashboard: calories and macros vs target, micronutrients vs Daily Value
- [x] Custom foods from label values; food search (every word, name or brand)
- [x] Day Summary and Complete day
- [ ] **USDA FoodData Central importer**: nutrient mapping and portion sizes (needs network access
      and verified nutrient numbers; this is the biggest gap)
- [ ] Authentication (see [DECISIONS](DECISIONS.md#auth-undecided))
- [ ] Trigram search (`pg_trgm`) once there are thousands of foods

### Phase 2: supplements (mostly done)
- [x] Supplement products entered from a label, per-serving nutrients
- [x] Your stack grouped by time of day, one tap to log what is left
- [x] Daily view split by source: how much of each nutrient came from supplements
- [x] Upper-limit warnings for the nutrients where the data model can apply them
- [ ] Vitamin A and folate limits (need preformed-retinol and folic-acid tracking)

### Phase 3: targets & insights (started)
- [x] Calorie goal with macro % split
- [x] Edit any nutrient target and upper limit
- [ ] Personalised reference intakes by age and sex (replaces the generic FDA Daily Values)
- [ ] Weekly and monthly trends; "nutrient gaps" report
- [ ] Recipes (computed from ingredients), saved meals, copy a day or meal

### Phase 4: extras
- Barcode scanning via Open Food Facts
- Weight and body measurements; water
- CSV export; offline use; installable PWA with a service worker

### Phase 5: fitness (planned)
The goal is one overall health picture, so the gym and exercise tracker joins the same app.
Exercise logging today is deliberately minimal (a name, minutes and calories burned) so the Day
Summary can show energy out as well as in.
- Workouts with exercises, sets, reps and weight; routines and history
- Calories burned estimated from the workout rather than typed in
- Rest timer, progress per lift
- One health view combining intake, training, weight and trends

## Platform

A mobile-first web app now, a native Android app when the fitness phase needs it. See
[PLATFORM](PLATFORM.md).

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
