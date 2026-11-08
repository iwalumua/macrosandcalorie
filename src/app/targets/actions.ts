"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { NUTRIENT_CATALOG } from "@/db/nutrient-catalog";
import { getTargetOverrides } from "@/db/queries";
import { resetTargets, saveCalorieGoal, saveTargets } from "@/db/mutations";
import { getCurrentUser } from "@/server/context";
import { optionalNumber, requiredNumber, toFormState, type FormState } from "@/server/form";
import type { TargetOverride } from "@/lib/targets";

/** Nutrients whose targets come from the calorie goal and macro split, not the per-nutrient list. */
const FROM_GOAL = new Set(["energy_kcal", "protein", "carbs", "fat"]);

export async function saveGoalAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const user = await getCurrentUser();
    await saveCalorieGoal(getDb(), user.id, requiredNumber(fd, "kcal", "Calorie goal"), {
      protein: requiredNumber(fd, "splitProtein", "Protein %"),
      carbs: requiredNumber(fd, "splitCarbs", "Carbs %"),
      fat: requiredNumber(fd, "splitFat", "Fat %"),
    });
  } catch (e) {
    return toFormState(e);
  }
  revalidatePath("/", "layout");
  redirect("/targets?saved=goal");
}

/**
 * Save per-nutrient targets. Each field carries the value it was rendered with
 * (`o_`/`ou_`), and only fields the user actually changed are saved. Otherwise
 * saving once would freeze every default as a custom value and later
 * improvements to the defaults would never reach this user.
 */
export async function saveNutrientTargetsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const user = await getCurrentUser();
    const existing = await getTargetOverrides(getDb(), user.id);
    const changes: Record<string, TargetOverride> = {};

    for (const n of NUTRIENT_CATALOG) {
      if (FROM_GOAL.has(n.key)) continue;
      const target = optionalNumber(fd, `t_${n.key}`, `${n.name} target`);
      const upper = optionalNumber(fd, `u_${n.key}`, `${n.name} upper limit`);
      const wasTarget = optionalNumber(fd, `o_${n.key}`, n.name);
      const wasUpper = optionalNumber(fd, `ou_${n.key}`, n.name);
      if (target === wasTarget && upper === wasUpper) continue; // untouched

      changes[n.key] = {
        // A cleared target is stored as 0, which means "no target for this nutrient".
        target: target ?? 0,
        // A cleared limit falls back to the default; an untouched one keeps whatever is stored.
        upperLimit: upper !== wasUpper ? (upper ?? null) : (existing[n.key]?.upperLimit ?? null),
      };
    }
    await saveTargets(getDb(), user.id, changes);
  } catch (e) {
    return toFormState(e);
  }
  revalidatePath("/", "layout");
  redirect("/targets?saved=nutrients");
}

export async function resetAllTargetsAction(): Promise<void> {
  const user = await getCurrentUser();
  const existing = await getTargetOverrides(getDb(), user.id);
  await resetTargets(getDb(), user.id, Object.keys(existing));
  revalidatePath("/", "layout");
  redirect("/targets?saved=reset");
}
