import type { Metadata } from "next";
import { formatDayLong } from "@/lib/dates";
import { resolveDate } from "@/server/context";
import { ActionForm, SubmitButton } from "../../_components/forms";
import { btnPrimary, hint, input, label } from "../../_components/styles";
import { PageHeader } from "../../_components/ui";
import { addExerciseAction } from "../../diary/actions";

export const metadata: Metadata = { title: "Add exercise" };

const SUGGESTIONS = ["Walking", "Running", "Cycling", "Swimming", "Strength training", "Yoga", "Hiking", "Sports"];

export default async function NewExercisePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const date = await resolveDate((await searchParams).date);
  return (
    <>
      <PageHeader
        title="Add exercise"
        subtitle={formatDayLong(date)}
        back={{ href: `/diary?date=${date}`, label: "Diary" }}
      />
      <ActionForm action={addExerciseAction} className="space-y-5">
        <input type="hidden" name="date" value={date} />
        <div>
          <label htmlFor="name" className={label}>
            Activity
          </label>
          <input id="name" name="name" required maxLength={120} list="exercise-suggestions" autoComplete="off" className={input} />
          <datalist id="exercise-suggestions">
            {SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="duration" className={label}>
              Minutes <span className="font-normal text-muted">(optional)</span>
            </label>
            <input id="duration" name="duration" type="text" inputMode="decimal" autoComplete="off" className={input} />
          </div>
          <div>
            <label htmlFor="calories" className={label}>
              Calories burned
            </label>
            <input id="calories" name="calories" required type="text" inputMode="decimal" autoComplete="off" className={input} />
          </div>
        </div>
        <p className={`${hint} -mt-2`}>
          Enter the calories your watch, app or gym machine reports. They are added to your calorie budget for the day.
        </p>
        <SubmitButton className={`${btnPrimary} w-full`}>Add exercise</SubmitButton>
      </ActionForm>
    </>
  );
}
