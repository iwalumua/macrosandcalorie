import { Check, Flame, Pill, RotateCcw, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/client";
import { loadDay } from "@/db/day";
import { formatAmount, formatKcal, formatMinutes, formatNumber, formatPercent, statusLabel, toneOf } from "@/lib/format";
import { MEAL_LABELS } from "@/lib/meals";
import type { DaySummary, NutrientRow } from "@/lib/summary";
import { getCurrentUser, getToday, resolveDate } from "@/server/context";
import { setDayCompleteAction } from "../diary/actions";
import { DateNav } from "../_components/DateNav";
import { SubmitButton } from "../_components/forms";
import { MacroBars } from "../_components/MacroBars";
import { NutrientRowList } from "../_components/NutrientRows";
import { btnPrimary, btnSecondary, TONE } from "../_components/styles";
import { Card, EmptyState, Meter, PageHeader, SectionTitle } from "../_components/ui";

export const metadata: Metadata = { title: "Day summary" };

export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  const date = await resolveDate((await searchParams).date);
  const today = await getToday();
  const { summary: s, day } = await loadDay(getDb(), user.id, date);
  const returnTo = `/summary?date=${date}`;

  return (
    <>
      <PageHeader
        title="Day summary"
        subtitle={s.complete ? "Completed day" : date === today ? "So far today" : "Not marked complete"}
        action={
          s.complete ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-good-soft px-3 py-1.5 text-sm font-semibold text-good">
              <Check aria-hidden className="size-4" strokeWidth={3} />
              Complete
            </span>
          ) : null
        }
      />
      <DateNav date={date} today={today} basePath="/summary" />

      {s.isEmpty ? (
        <div className="mb-4">
          <EmptyState title="Nothing logged for this day">
            Add food, supplements or exercise in your{" "}
            <Link href={`/diary?date=${date}`} className="font-medium text-primary underline">
              diary
            </Link>{" "}
            and the summary appears here.
          </EmptyState>
        </div>
      ) : (
        <>
          <EnergyCard s={s} />
          <ExerciseCard s={s} />
          <MacrosCard s={s} />
          <MealsCard s={s} />
          <NutrientReport s={s} />
        </>
      )}

      <Card className="mb-4" aria-label="Finish the day">
        {s.complete ? (
          <form action={setDayCompleteAction}>
            <input type="hidden" name="date" value={date} />
            <input type="hidden" name="complete" value="false" />
            <input type="hidden" name="returnTo" value={returnTo} />
            <SubmitButton className={`${btnSecondary} w-full`} pendingLabel="Re-opening…">
              <RotateCcw aria-hidden className="size-5" />
              Re-open this day
            </SubmitButton>
          </form>
        ) : (
          <form action={setDayCompleteAction}>
            <input type="hidden" name="date" value={date} />
            <input type="hidden" name="complete" value="true" />
            <input type="hidden" name="returnTo" value={returnTo} />
            <SubmitButton className={`${btnPrimary} w-full`} pendingLabel="Completing…">
              <Check aria-hidden className="size-5" />
              Mark day complete
            </SubmitButton>
          </form>
        )}
        <Link href={`/diary?date=${date}`} className={`${btnSecondary} mt-2 w-full`}>
          {day.complete ? "Edit entries" : "Back to diary"}
        </Link>
      </Card>

      <p className="mb-2 px-1 text-xs text-muted">
        Targets are generic adult Daily Values, not advice for you personally. Upper limits are general adult reference
        points from the NIH. Neither is medical advice; set your own targets on the Targets tab.
      </p>
    </>
  );
}

function EnergyCard({ s }: { s: DaySummary }) {
  const e = s.energy;
  const over = e.remaining !== null && e.remaining < 0;
  return (
    <Card className="mb-4" aria-labelledby="energy-heading">
      <SectionTitle
        action={
          e.budget === null ? null : (
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[toneOf(e.status)].soft} ${TONE[toneOf(e.status)].text}`}>
              {e.status === "good" ? "On goal" : e.status === "low" ? "Under goal" : "Over goal"}
            </span>
          )
        }
      >
        <span id="energy-heading">Calories</span>
      </SectionTitle>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <Big label="Eaten" value={formatKcal(e.eaten)} />
        <Big label="Exercise" value={formatKcal(e.burned)} tone="text-exercise" />
        <Big label="Net" value={formatKcal(e.net)} />
      </dl>

      {e.budget !== null && e.remaining !== null ? (
        <div className="mt-4">
          <Meter
            percent={e.percentOfBudget}
            color={over ? "bg-over" : "bg-primary"}
            label="Calories eaten against budget"
            valueText={`${formatPercent(e.percentOfBudget ?? 0)} of ${formatKcal(e.budget)} calorie budget`}
            height="h-3"
          />
          <p className="mt-2 text-sm text-muted">
            Goal {formatKcal(e.goal ?? 0)}
            {e.burned > 0 ? ` + ${formatKcal(e.burned)} exercise` : ""} = {formatKcal(e.budget)} budget.{" "}
            <span className={`font-semibold ${over ? "text-over" : "text-ink"}`}>
              {formatKcal(Math.abs(e.remaining))} {over ? "over" : "left"}.
            </span>
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">
          No calorie goal set.{" "}
          <Link href="/targets" className="font-medium text-primary underline">
            Set one
          </Link>{" "}
          to see how the day measures up.
        </p>
      )}
    </Card>
  );
}

function Big({ label, value, tone = "text-ink" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-surface-2 py-3">
      <dd className={`text-2xl font-bold tracking-tight ${tone}`}>{value}</dd>
      <dt className="text-xs text-muted">{label} kcal</dt>
    </div>
  );
}

function ExerciseCard({ s }: { s: DaySummary }) {
  const x = s.exercise;
  return (
    <Card className="mb-4" aria-labelledby="exercise-heading">
      <SectionTitle>
        <span id="exercise-heading">Exercise</span>
      </SectionTitle>
      {x.items.length === 0 ? (
        <p className="text-sm text-muted">No exercise logged this day.</p>
      ) : (
        <>
          <p className="mb-2 flex items-baseline gap-2">
            <Flame aria-hidden className="size-5 self-center text-exercise" />
            <span className="text-2xl font-bold text-exercise">{formatKcal(x.totalBurned)}</span>
            <span className="text-sm text-muted">
              kcal burned{x.totalMinutes > 0 ? ` in ${formatMinutes(x.totalMinutes)}` : ""}
            </span>
          </p>
          <ul>
            {x.items.map((i, idx) => (
              <li key={i.id ?? idx} className="flex items-baseline justify-between gap-3 border-t border-line py-2 text-sm">
                <span className="min-w-0 truncate font-medium">{i.name}</span>
                <span className="shrink-0 text-muted">
                  {formatKcal(i.caloriesBurned)} kcal{i.durationMin ? ` · ${formatMinutes(i.durationMin)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function MacrosCard({ s }: { s: DaySummary }) {
  const total = s.macros.reduce((sum, m) => sum + m.kcal, 0);
  const SEGMENT = { protein: "bg-protein", carbs: "bg-carbs", fat: "bg-fat" } as const;
  return (
    <Card className="mb-4" aria-labelledby="macros-heading">
      <SectionTitle>
        <span id="macros-heading">Macros</span>
      </SectionTitle>
      {total > 0 ? (
        <>
          <div
            role="img"
            aria-label={`Share of calories: ${s.macros.map((m) => `${m.name} ${formatPercent(m.percentOfCalories)}`).join(", ")}`}
            className="mb-2 flex h-4 w-full overflow-hidden rounded-full bg-surface-2"
          >
            {s.macros.map((m) => (
              <div key={m.key} className={SEGMENT[m.key]} style={{ width: `${m.percentOfCalories}%` }} />
            ))}
          </div>
          <p className="mb-4 text-sm text-muted">
            {s.macros.map((m, i) => (
              <span key={m.key}>
                {i > 0 ? " · " : ""}
                {m.name} <span className="font-semibold text-ink">{formatPercent(m.percentOfCalories)}</span>
              </span>
            ))}{" "}
            of calories
          </p>
        </>
      ) : null}
      <MacroBars macros={s.macros} />
    </Card>
  );
}

function MealsCard({ s }: { s: DaySummary }) {
  const used = s.meals.filter((m) => m.items > 0);
  if (used.length === 0) return null;
  const max = Math.max(...used.map((m) => m.kcal), 1);
  return (
    <Card className="mb-4" aria-labelledby="meals-heading">
      <SectionTitle>
        <span id="meals-heading">By meal</span>
      </SectionTitle>
      <ul className="space-y-3">
        {used.map((m) => (
          <li key={m.meal}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-medium">{MEAL_LABELS[m.meal]}</span>
              <span className="text-muted">
                <span className="font-semibold text-ink">{formatKcal(m.kcal)}</span> kcal · P {formatNumber(m.protein, 0)} · C{" "}
                {formatNumber(m.carbs, 0)} · F {formatNumber(m.fat, 0)}
              </span>
            </div>
            <Meter
              percent={(m.kcal / max) * 100}
              color="bg-primary"
              label={MEAL_LABELS[m.meal]}
              valueText={`${formatKcal(m.kcal)} calories`}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function NutrientReport({ s }: { s: DaySummary }) {
  const g = s.groups;
  // A nutrient can be over its limit and over an upper limit; list it once, under "Over a limit".
  const overKeys = new Set(g.over.map((r) => r.key));
  const overRows = [...g.over, ...g.overUpperLimit.filter((r) => !overKeys.has(r.key))];
  // A nutrient flagged there is not also praised or listed as a shortfall further down.
  const flagged = new Set(overRows.map((r) => r.key));
  const good = g.good.filter((r) => !flagged.has(r.key));
  const near = g.near.filter((r) => !flagged.has(r.key));
  const low = g.low.filter((r) => !flagged.has(r.key));
  const noTarget = s.nutrients.filter((r) => r.status === "no_target" && r.amount !== null);
  const pct = s.score.total === 0 ? 0 : (s.score.met / s.score.total) * 100;

  return (
    <>
      <Card className="mb-4" aria-labelledby="score-heading">
        <SectionTitle>
          <span id="score-heading">Nutrient targets</span>
        </SectionTitle>
        {s.score.total === 0 ? (
          <p className="text-sm text-muted">
            None of the foods logged include vitamin or mineral data, so there is nothing to compare yet.
          </p>
        ) : (
          <>
            <p className="mb-2">
              <span className="text-3xl font-bold tracking-tight">{s.score.met}</span>
              <span className="text-muted"> of {s.score.total} targets met</span>
            </p>
            <Meter
              percent={pct}
              color="bg-good"
              label="Nutrient targets met"
              valueText={`${s.score.met} of ${s.score.total} targets met`}
              height="h-3"
            />
            <p className="mt-2 text-sm text-muted">
              Only nutrients that your logged foods and supplements report are counted.
            </p>
          </>
        )}
      </Card>

      {good.length > 0 ? (
        <Card className="mb-4" aria-labelledby="well-heading">
          <SectionTitle>
            <span id="well-heading">Went well</span>
          </SectionTitle>
          <ul className="flex flex-wrap gap-2">
            {good.map((r) => (
              <li
                key={r.key}
                className="inline-flex items-center gap-1.5 rounded-full bg-good-soft px-3 py-1.5 text-sm font-medium text-good"
              >
                <Check aria-hidden className="size-4" strokeWidth={3} />
                {r.name}
                <span className="sr-only">: {statusLabel(r.status, r.direction)}.</span>
                {r.percent !== null ? (
                  <span className="font-normal">
                    {formatPercent(r.percent)}
                    {r.direction === "limit" ? " of limit" : ""}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {g.supplementAssist.length > 0 ? (
        <Card className="mb-4" aria-labelledby="assist-heading">
          <SectionTitle>
            <span id="assist-heading">Supplements helped</span>
          </SectionTitle>
          <p className="mb-2 text-sm text-muted">Food alone fell short of these. Your supplements closed the gap.</p>
          <ul className="space-y-1.5">
            {g.supplementAssist.map((r) => (
              <li key={r.key} className="flex items-start gap-2 text-sm">
                <Pill aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>
                  <span className="block font-medium">{r.name}</span>
                  <span className="block text-muted">
                    {formatAmount(r.fromFood, r.unit)} from food + {formatAmount(r.fromSupplements, r.unit)} from
                    supplements
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {overRows.length > 0 ? (
        <Card className="mb-4" aria-labelledby="over-heading">
          <SectionTitle>
            <span id="over-heading" className="inline-flex items-center gap-1.5">
              <TriangleAlert aria-hidden className="size-4 text-over" />
              Over a limit
            </span>
          </SectionTitle>
          <NutrientRowList rows={overRows} />
        </Card>
      ) : null}

      {low.length > 0 ? (
        <Card className="mb-4" aria-labelledby="low-heading">
          <SectionTitle>
            <span id="low-heading">Falling short</span>
          </SectionTitle>
          <p className="text-sm text-muted">Below 70% of target, lowest first.</p>
          <NutrientRowList rows={low} />
        </Card>
      ) : null}

      {near.length > 0 ? (
        <Card className="mb-4" aria-labelledby="near-heading">
          <SectionTitle>
            <span id="near-heading">Almost there</span>
          </SectionTitle>
          <NutrientRowList rows={near} />
        </Card>
      ) : null}

      {g.noData.length > 0 || noTarget.length > 0 ? (
        <Card className="mb-4">
          <details>
            <summary className="flex min-h-12 cursor-pointer items-center justify-between text-base font-semibold">
              Not scored
              <span className="text-sm font-normal text-muted">{g.noData.length + noTarget.length} nutrients</span>
            </summary>
            {g.noData.length > 0 ? (
              <>
                <p className="mt-1 text-sm text-muted">
                  Nothing logged today includes data for these, so they are unknown, not zero:
                </p>
                <p className="mt-1 text-sm">{g.noData.map((r) => r.name).join(", ")}.</p>
              </>
            ) : null}
            {noTarget.length > 0 ? (
              <>
                <p className="mt-3 text-sm text-muted">Tracked, but with no daily target:</p>
                <ul className="mt-1 text-sm">
                  {noTarget.map((r: NutrientRow) => (
                    <li key={r.key} className="flex justify-between gap-3 py-0.5">
                      <span>{r.name}</span>
                      <span className="font-semibold">{formatAmount(r.amount ?? 0, r.unit)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </details>
        </Card>
      ) : null}
    </>
  );
}
