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
- [x] **USDA FoodData Central importer** (SR Legacy + Foundation, verified mapping, re-runnable)
- [x] Barcode lookup on Open Food Facts by typed number
- [ ] Authentication (see [DECISIONS](DECISIONS.md#auth-undecided))
- [ ] Trigram search (`pg_trgm`): measured at a 13 ms median over 8,200 foods, so not needed yet

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
- Camera barcode scanning (typed lookup already works)
- More food databases (see Data sources)
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

What is used, and what was actually checked (on 2026-11-08, from each source's own pages).

**USDA FoodData Central: used.** Licence, as published by USDA: *"USDA FoodData Central data are in
the public domain and they are not copyrighted. They are published under CC0 1.0 Universal (CC0
1.0). No permission is needed for their use, but we request that users list FoodData Central as the
source."* (fdc.nal.usda.gov/api-guide). The app credits it next to every USDA food.

- Imported: **SR Legacy** (April 2018, 7,793 foods, all complete) and **Foundation Foods**
  (April 2026 release, 428 of its 469 foods; see the Foundation notes below).
- Not imported: **Branded Foods** (431 MB zipped; packaged foods come from barcode lookups instead)
  and the Survey (FNDDS) dataset.
- All 45 catalogue nutrient numbers were checked against FDC's own `nutrient.csv`, including the four
  that had been left unmapped (added sugars 539, iodine 314, chromium 310, molybdenum 316).
- Foundation notes, each found in the real files: its `food.csv` has ~88,000 rows but only 469 are
  foods (the rest are lab samples); most carry Atwater energy (957/958) instead of 208; 40 have no
  energy and no macros at all (olive oil, salt, rhubarb...) and are skipped because logging them
  would silently count 0 kcal (SR Legacy has them completely); the newest archive (2026-10-29) is
  missing `food.csv` and `food_nutrient.csv`, so releases are pinned and archives validated.

**Open Food Facts: used for barcode lookups.** Terms, as published by Open Food Facts: the database
is under the **Open Database License (ODbL)**, individual contents under the **Database Contents
License (DbCL)**, and product images under **CC-BY-SA** (world.openfoodfacts.org/terms-of-use and
/data). Reusers must attribute ("Contains data from Open Food Facts, available under the Open
Database License", which is the wording the app uses), and keep share-alike terms if they
redistribute the database or a derived one.

- Only the product a person looks up is stored, on demand, never a bulk copy, and **no images**.
- It is volunteer-entered, so lookups are treated with suspicion: impossible values are dropped,
  products whose macros exceed 100 g per 100 g are refused, and nutrients with ambiguous
  definitions (vitamin A, folate, alcohol) are not imported. The app tells people to check the label.
- If the app is ever published with a shared database of stored products, re-read the share-alike
  terms first. These rows are marked `source = 'off'` so they can be separated.
- Requests send a User-Agent identifying the app, as Open Food Facts asks, and are rate limited.

**Cronometer's database (NCCDB)** is proprietary; we do not use it.

**Other free databases: not built, licences not checked.** Candidates for later, each needing its own
verified mapping: Canadian Nutrient File, UK McCance and Widdowson (CoFID), Australian
AUSNUT/NUTTAB, and regional tables for foods the US sets miss. (The Health Canada site did not
respond from the build sandbox.) Commercial APIs with free tiers (Nutritionix, Edamam, FatSecret) are
not planned: their terms generally restrict storing and redistributing results, so "free to call" is
not "free to keep".

## Safety

Nutrition targets and supplement upper limits are informational. The app must not present itself
as medical advice, and generic Daily Values must be labelled as generic.
