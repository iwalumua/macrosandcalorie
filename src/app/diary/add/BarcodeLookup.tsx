"use client";

import { ScanBarcode } from "lucide-react";
import type { Meal } from "@/lib/meals";
import { ActionForm, SubmitButton } from "../../_components/forms";
import { btnSecondary, hint, input, label } from "../../_components/styles";
import { lookupBarcodeAction } from "./actions";

/** Type the number printed under a barcode to find a packaged food on Open Food Facts. */
export function BarcodeLookup({ date, meal }: { date: string; meal: Meal }) {
  return (
    <ActionForm action={lookupBarcodeAction} className="mb-5 rounded-2xl border border-line bg-surface p-3">
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="meal" value={meal} />
      <label htmlFor="barcode" className={label}>
        Packaged food? Look it up by barcode
      </label>
      <div className="flex gap-2">
        <input
          id="barcode"
          name="barcode"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Number under the barcode"
          className={input}
        />
        <SubmitButton className={`${btnSecondary} shrink-0 gap-1.5 px-4`} pendingLabel="Looking…">
          <ScanBarcode aria-hidden className="size-5" />
          Look up
        </SubmitButton>
      </div>
      <p className={hint}>Uses Open Food Facts. Camera scanning is not built yet.</p>
    </ActionForm>
  );
}
