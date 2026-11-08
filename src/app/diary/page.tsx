import { Check, ClipboardList, Pill, Plus, RotateCcw, Trash2, Flame } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/client";
import { loadDay } from "@/db/day";
import type { DiaryEntryView } from "@/db/queries";
import { formatKcal, formatMinutes, formatNumber } from "@/lib/format";
import { MEAL_LABELS, MEALS } from "@/lib/meals";
import { getCurrentUser, getToday, resolveDate } from "@/server/context";
import { CalorieRing } from "../_components/CalorieRing";
import { DateNav } from "../_components/DateNav";
import { SubmitButton } from "../_components/forms";
import { MacroBars } from "../_components/MacroBars";
import { btnGhost, btnIcon, btnPrimary, btnSecondary } from "../_components/styles";
import { Card, PageHeader, SectionTitle } from "../_components/ui";
import {
  deleteExerciseAction,
  deleteSupplementLogAction,
  setDayCompleteAction,
} from "./actions";

export const metadata: Metadata = { title: "Diary" };

export default async function DiaryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  const date = await resolveDate((await searchParams).date);
  const today = await getToday();
  const { day, summary } = await loadDay(getDb(), user.id, date);
  const summaryHref = `/summary?date=${date}`;

  return (
    <>
      <PageHeader
        title="Diary"
        action={
          <Link href={summaryHref} className={`${btnSecondary} min-h-12 gap-1.5 px-4`}>
            <ClipboardList aria-hidden className="size-5" />
            Summary
          </Link>
        }
      />
      <DateNav date={date} today={today} basePath="/diary" />

      <Card className="mb-4">
        <CalorieRing energy={summary.energy} />
        <div className="mt-5 border-t border-line pt-4">
          <MacroBars macros={summary.macros} />
        </div>
        {summary.energy.goal === null ? (
          <p className="mt-4 text-sm text-muted">
            No calorie goal yet.{" "}
            <Link href="/targets" className="font-medium text-primary underline">
              Set one
            </Link>
          </p>
        ) : null}
      </Card>

      {MEALS.map((meal) => {
        const entries = day.entries.filter((e) => e.meal === meal);
        const kcal = summary.meals.find((m) => m.meal === meal)?.kcal ?? 0;
        return (
          <Card key={meal} className="mb-4" aria-labelledby={`meal-${meal}`}>
            <div className="mb-1 flex items-baseline justify-between">
              <h2 id={`meal-${meal}`} className="text-base font-semibold">
                {MEAL_LABELS[meal]}
              </h2>
              <span className="text-sm text-muted">{entries.length > 0 ? `${formatKcal(kcal)} kcal` : null}</span>
            </div>
            {entries.length > 0 ? (
              <ul>
                {entries.map((e) => (
                  <EntryRow key={e.id} entry={e} date={date} />
                ))}
              </ul>
            ) : null}
            <Link
              href={`/diary/add?date=${date}&meal=${meal}`}
              className={`${btnGhost} -ml-3 mt-1 min-h-12 gap-1.5`}
            >
              <Plus aria-hidden className="size-5" />
              Add food
              <span className="sr-only"> to {MEAL_LABELS[meal]}</span>
            </Link>
          </Card>
        );
      })}

      <Card className="mb-4" aria-labelledby="supplements-heading">
        <SectionTitle
          action={
            <span className="text-sm text-muted">
              {day.supplementLogs.length > 0 ? `${day.supplementLogs.length} taken` : null}
            </span>
          }
        >
          <span id="supplements-heading">Supplements</span>
        </SectionTitle>
        {day.supplementLogs.length > 0 ? (
          <ul>
            {day.supplementLogs.map((s) => (
              <li key={s.id} className="flex items-center gap-2 border-b border-line py-1 last:border-b-0">
                <Pill aria-hidden className="size-5 shrink-0 text-muted" />
                <div className="min-w-0 flex-1 py-2">
                  <p className="truncate font-medium">{s.name}</p>
                  <p className="truncate text-sm text-muted">
                    {formatNumber(s.servings)} × {s.servingLabel}
                  </p>
                </div>
                <form action={deleteSupplementLogAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <SubmitButton className={btnIcon} ariaLabel={`Remove ${s.name}`} pendingLabel="">
                    <Trash2 aria-hidden className="size-5" />
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
        <Link href={`/supplements?date=${date}`} className={`${btnGhost} -ml-3 min-h-12 gap-1.5`}>
          <Plus aria-hidden className="size-5" />
          Log supplements
        </Link>
      </Card>

      <Card className="mb-4" aria-labelledby="exercise-heading">
        <SectionTitle
          action={
            <span className="text-sm text-muted">
              {summary.exercise.totalBurned > 0 ? `${formatKcal(summary.exercise.totalBurned)} kcal burned` : null}
            </span>
          }
        >
          <span id="exercise-heading">Exercise</span>
        </SectionTitle>
        {day.exercise.length > 0 ? (
          <ul>
            {day.exercise.map((x) => (
              <li key={x.id} className="flex items-center gap-2 border-b border-line py-1 last:border-b-0">
                <Flame aria-hidden className="size-5 shrink-0 text-exercise" />
                <div className="min-w-0 flex-1 py-2">
                  <p className="truncate font-medium">{x.name}</p>
                  <p className="truncate text-sm text-muted">
                    {formatKcal(x.caloriesBurned)} kcal{x.durationMin ? ` · ${formatMinutes(x.durationMin)}` : ""}
                  </p>
                </div>
                <form action={deleteExerciseAction}>
                  <input type="hidden" name="id" value={x.id} />
                  <SubmitButton className={btnIcon} ariaLabel={`Remove ${x.name}`} pendingLabel="">
                    <Trash2 aria-hidden className="size-5" />
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
        <Link href={`/exercise/new?date=${date}`} className={`${btnGhost} -ml-3 min-h-12 gap-1.5`}>
          <Plus aria-hidden className="size-5" />
          Add exercise
        </Link>
      </Card>

      <Card aria-labelledby="finish-heading" className="mb-2">
        <h2 id="finish-heading" className="flex items-center gap-2 text-base font-semibold">
          {day.complete ? (
            <>
              <Check aria-hidden className="size-5 text-good" strokeWidth={3} />
              Day complete
            </>
          ) : (
            "Finished for the day?"
          )}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {day.complete
            ? "Your summary for this day is ready. You can still edit entries."
            : "Mark the day complete to see your summary: calories in and out, macros, and which nutrients you hit."}
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          {day.complete ? (
            <>
              <Link href={summaryHref} className={`${btnPrimary} flex-1`}>
                <ClipboardList aria-hidden className="size-5" />
                View summary
              </Link>
              <form action={setDayCompleteAction} className="flex">
                <input type="hidden" name="date" value={date} />
                <input type="hidden" name="complete" value="false" />
                <SubmitButton className={`${btnSecondary} flex-1`} pendingLabel="Re-opening…">
                  <RotateCcw aria-hidden className="size-5" />
                  Re-open day
                </SubmitButton>
              </form>
            </>
          ) : (
            <>
              <form action={setDayCompleteAction} className="flex flex-1">
                <input type="hidden" name="date" value={date} />
                <input type="hidden" name="complete" value="true" />
                <input type="hidden" name="returnTo" value={summaryHref} />
                <SubmitButton className={`${btnPrimary} flex-1`} pendingLabel="Completing…">
                  <Check aria-hidden className="size-5" />
                  Complete day &amp; view summary
                </SubmitButton>
              </form>
              <Link href={summaryHref} className={btnSecondary}>
                Preview
              </Link>
            </>
          )}
        </div>
      </Card>
    </>
  );
}

function EntryRow({ entry, date }: { entry: DiaryEntryView; date: string }) {
  const amount = entry.servingLabel
    ? `${formatNumber(entry.quantity)} × ${entry.servingLabel} · ${formatNumber(entry.grams, 0)} g`
    : `${formatNumber(entry.grams)} g`;
  const kcal = entry.amounts.energy_kcal;
  return (
    <li className="border-b border-line last:border-b-0">
      <Link
        href={`/diary/log/${entry.foodId}?date=${date}&meal=${entry.meal}&entry=${entry.id}`}
        className="flex min-h-14 items-center justify-between gap-3 py-2"
      >
        <span className="min-w-0">
          <span className="line-clamp-2 font-medium">{entry.name}</span>
          <span className="block truncate text-sm text-muted">
            {entry.brand ? `${entry.brand} · ` : ""}
            {amount}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold">
          {kcal === undefined ? "–" : `${formatKcal(kcal)} kcal`}
        </span>
      </Link>
    </li>
  );
}
