"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import {
  createSupplementProduct,
  logStackRemaining,
  logSupplement,
  removeStackItem,
  setStackItem,
  SUPPLEMENT_TIMINGS,
  type SupplementTiming,
} from "@/db/mutations";
import { InputError } from "@/lib/errors";
import { getCurrentUser } from "@/server/context";
import {
  dateField,
  idField,
  optionalNumber,
  requiredNumber,
  safeReturnPath,
  text,
  toFormState,
  type FormState,
} from "@/server/form";
import { readNutrientFields } from "@/server/nutrient-fields";

const refresh = () => revalidatePath("/", "layout");

function timingField(fd: FormData, key = "timing"): SupplementTiming | null {
  const v = text(fd, key);
  if (v === "") return null;
  if (!(SUPPLEMENT_TIMINGS as readonly string[]).includes(v)) throw new InputError("Choose a valid time of day.");
  return v as SupplementTiming;
}

export async function createSupplementAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const user = await getCurrentUser();
    const productId = await createSupplementProduct(getDb(), user.id, {
      name: text(fd, "name"),
      brand: text(fd, "brand"),
      servingLabel: text(fd, "servingLabel") || "1 serving",
      perServing: readNutrientFields(fd),
    });
    if (text(fd, "addToStack") === "on") {
      await setStackItem(getDb(), user.id, productId, {
        servingsPerDose: optionalNumber(fd, "servingsPerDose", "Servings per dose") ?? 1,
        timing: timingField(fd),
      });
    }
  } catch (e) {
    return toFormState(e);
  }
  refresh();
  redirect("/supplements");
}

export async function setStackItemAction(fd: FormData): Promise<void> {
  const user = await getCurrentUser();
  await setStackItem(getDb(), user.id, idField(fd, "productId"), {
    servingsPerDose: requiredNumber(fd, "servingsPerDose", "Servings per dose"),
    timing: timingField(fd),
  });
  refresh();
}

export async function removeStackItemAction(fd: FormData): Promise<void> {
  const user = await getCurrentUser();
  await removeStackItem(getDb(), user.id, idField(fd, "productId"));
  refresh();
}

/** Log one dose of a supplement on a day. */
export async function logSupplementAction(fd: FormData): Promise<void> {
  const user = await getCurrentUser();
  await logSupplement(getDb(), user.id, {
    productId: idField(fd, "productId"),
    date: dateField(fd),
    servings: optionalNumber(fd, "servings", "Servings") ?? 1,
  });
  refresh();
  redirect(safeReturnPath(text(fd, "returnTo"), "/supplements"));
}

/** Log every stack item not yet logged on a day (optionally just one time of day). */
export async function logStackAction(fd: FormData): Promise<void> {
  const user = await getCurrentUser();
  await logStackRemaining(getDb(), user.id, dateField(fd), timingField(fd) ?? undefined);
  refresh();
  redirect(safeReturnPath(text(fd, "returnTo"), "/supplements"));
}
