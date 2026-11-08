"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import {
  addExercise,
  deleteDiaryEntry,
  deleteExercise,
  deleteSupplementLog,
  logFood,
  setDayComplete,
  updateDiaryEntry,
} from "@/db/mutations";
import { InputError } from "@/lib/errors";
import { getCurrentUser } from "@/server/context";
import {
  dateField,
  idField,
  mealField,
  optionalIdField,
  optionalNumber,
  requiredNumber,
  safeReturnPath,
  text,
  toFormState,
  type FormState,
} from "@/server/form";

const refresh = () => revalidatePath("/", "layout");

/** Log a food, or (with `entryId`) change an existing entry. */
export async function logFoodAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let date = "";
  try {
    const user = await getCurrentUser();
    date = dateField(fd);
    const meal = mealField(fd);
    const foodId = idField(fd, "foodId");
    // The serving field is a serving id, or the word "grams" to enter a weight directly.
    const servingId = text(fd, "serving") === "grams" ? null : idField(fd, "serving");
    const quantity = requiredNumber(fd, "quantity", "Amount");
    const entryId = optionalIdField(fd, "entryId");

    if (entryId) {
      const ok = await updateDiaryEntry(getDb(), user.id, entryId, { meal, servingId, quantity });
      if (!ok) throw new InputError("That entry no longer exists.");
    } else {
      await logFood(getDb(), user.id, { date, meal, foodId, servingId, quantity });
    }
  } catch (e) {
    return toFormState(e);
  }
  refresh();
  redirect(`/diary?date=${date}`);
}

export async function deleteEntryAction(fd: FormData): Promise<void> {
  const user = await getCurrentUser();
  await deleteDiaryEntry(getDb(), user.id, idField(fd, "id"));
  refresh();
  redirect(safeReturnPath(text(fd, "returnTo"), `/diary?date=${dateField(fd)}`));
}

export async function deleteSupplementLogAction(fd: FormData): Promise<void> {
  const user = await getCurrentUser();
  await deleteSupplementLog(getDb(), user.id, idField(fd, "id"));
  refresh();
}

export async function addExerciseAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let date = "";
  try {
    const user = await getCurrentUser();
    date = dateField(fd);
    await addExercise(getDb(), user.id, {
      date,
      name: text(fd, "name"),
      durationMin: optionalNumber(fd, "duration", "Duration") ?? null,
      caloriesBurned: requiredNumber(fd, "calories", "Calories burned"),
    });
  } catch (e) {
    return toFormState(e);
  }
  refresh();
  redirect(`/diary?date=${date}`);
}

export async function deleteExerciseAction(fd: FormData): Promise<void> {
  const user = await getCurrentUser();
  await deleteExercise(getDb(), user.id, idField(fd, "id"));
  refresh();
}

/** Mark a day complete (`complete=true`) or re-open it, then return to where the user was. */
export async function setDayCompleteAction(fd: FormData): Promise<void> {
  const user = await getCurrentUser();
  const date = dateField(fd);
  await setDayComplete(getDb(), user.id, date, text(fd, "complete") === "true");
  refresh();
  redirect(safeReturnPath(text(fd, "returnTo"), `/diary?date=${date}`));
}
