"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { upsertImportedFoods } from "@/db/import-foods";
import { findFoodByBarcode } from "@/db/queries";
import { InputError } from "@/lib/errors";
import { describeOffFailure, isBarcode } from "@/lib/openfoodfacts";
import { getCurrentUser } from "@/server/context";
import { dateField, mealField, text, toFormState, type FormState } from "@/server/form";
import { fetchOffProduct } from "@/server/off-client";
import { createThrottle } from "@/server/throttle";

/** Open Food Facts allows about 100 product reads a minute; stay well under, for everyone sharing this server. */
const allowLookup = createThrottle(30, 60_000);

/**
 * Find a packaged food by barcode: use the copy already stored if there is one,
 * otherwise fetch it from Open Food Facts, store it, and go straight to logging it.
 */
export async function lookupBarcodeAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let destination = "";
  try {
    const user = await getCurrentUser();
    const barcode = text(fd, "barcode").replace(/[\s-]/g, "");
    if (!isBarcode(barcode)) {
      throw new InputError("Enter the barcode number: 8 to 14 digits, printed under the bars.");
    }
    const date = dateField(fd);
    const meal = mealField(fd);

    let foodId = await findFoodByBarcode(getDb(), user.id, barcode);
    if (!foodId) {
      if (!allowLookup()) throw new InputError("Too many barcode lookups in a row. Wait a minute and try again.");
      const result = await fetchOffProduct(barcode);
      if (!result.ok) throw new InputError(describeOffFailure(result.reason, barcode));
      await upsertImportedFoods(getDb(), [result.food]);
      foodId = await findFoodByBarcode(getDb(), user.id, barcode);
      if (!foodId) throw new Error("A food was imported but could not be found again.");
    }
    destination = `/diary/log/${foodId}?date=${date}&meal=${meal}`;
  } catch (e) {
    return toFormState(e);
  }
  revalidatePath("/", "layout");
  redirect(destination);
}
