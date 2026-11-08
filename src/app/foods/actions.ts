"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { createCustomFood } from "@/db/mutations";
import { isDateString } from "@/lib/dates";
import { isMeal } from "@/lib/meals";
import { getCurrentUser } from "@/server/context";
import { requiredNumber, text, toFormState, type FormState } from "@/server/form";
import { readNutrientFields } from "@/server/nutrient-fields";

/** Create a food from label values, then go straight to logging it. */
export async function createFoodAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let destination = "/diary/add";
  try {
    const user = await getCurrentUser();
    const id = await createCustomFood(getDb(), user.id, {
      name: text(fd, "name"),
      brand: text(fd, "brand"),
      servingLabel: text(fd, "servingLabel") || "1 serving",
      servingGrams: requiredNumber(fd, "servingGrams", "Serving weight"),
      perServing: readNutrientFields(fd),
    });
    const date = text(fd, "date");
    const meal = text(fd, "meal");
    destination =
      isDateString(date) && isMeal(meal)
        ? `/diary/log/${id}?date=${date}&meal=${meal}`
        : `/diary/add`;
  } catch (e) {
    return toFormState(e);
  }
  revalidatePath("/", "layout");
  redirect(destination);
}
