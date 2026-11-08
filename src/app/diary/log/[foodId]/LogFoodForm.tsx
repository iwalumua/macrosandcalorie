"use client";

import { useState } from "react";
import { formatKcal, formatNumber } from "@/lib/format";
import { MEAL_LABELS, MEALS, type Meal } from "@/lib/meals";
import { scalePer100g, type NutrientAmounts } from "@/lib/nutrition";
import type { FormState } from "@/server/form";
import { ActionForm, SubmitButton } from "../../../_components/forms";
import { btnPrimary, card, input, label } from "../../../_components/styles";

interface Props {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  food: {
    id: string;
    servings: { id: string; label: string; grams: number; isDefault: boolean }[];
    /** Energy, protein, carbs and fat per 100 g, where known. */
    per100g: NutrientAmounts;
  };
  date: string;
  meal: Meal;
  /** Present when editing an existing diary entry. */
  entry?: { id: string; quantity: number; servingId: string | null };
}

const GRAMS = "grams";

/** Parse what a person typed ("1,5" or "1.5"); null if it is not a positive number. */
function parseAmount(raw: string): number | null {
  const n = Number(raw.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function LogFoodForm({ action, food, date, meal, entry }: Props) {
  const defaultServing = food.servings.find((s) => s.isDefault) ?? food.servings[0];
  const [serving, setServing] = useState<string>(
    entry ? (entry.servingId ?? GRAMS) : (defaultServing?.id ?? GRAMS),
  );
  const [quantity, setQuantity] = useState<string>(
    entry ? String(entry.quantity) : serving === GRAMS ? "100" : "1",
  );

  const servingGrams = food.servings.find((s) => s.id === serving)?.grams ?? null;
  const amount = parseAmount(quantity);
  const grams = amount === null ? null : serving === GRAMS ? amount : servingGrams === null ? null : amount * servingGrams;
  const eaten = grams === null ? null : scalePer100g(food.per100g, grams);

  /** Switching unit keeps the same weight instead of reusing the number. */
  function changeServing(next: string) {
    if (grams !== null) {
      const nextServingGrams = food.servings.find((s) => s.id === next)?.grams ?? null;
      if (next === GRAMS) setQuantity(String(Math.round(grams * 10) / 10));
      else if (nextServingGrams) setQuantity(String(Math.round((grams / nextServingGrams) * 100) / 100));
    }
    setServing(next);
  }

  return (
    <ActionForm action={action} className="space-y-4">
      <input type="hidden" name="foodId" value={food.id} />
      <input type="hidden" name="date" value={date} />
      {entry ? <input type="hidden" name="entryId" value={entry.id} /> : null}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="quantity" className={label}>
            Amount
          </label>
          <input
            id="quantity"
            name="quantity"
            type="text"
            inputMode="decimal"
            required
            autoComplete="off"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={input}
          />
        </div>
        <div>
          <label htmlFor="serving" className={label}>
            Unit
          </label>
          <select id="serving" name="serving" value={serving} onChange={(e) => changeServing(e.target.value)} className={input}>
            {food.servings.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({formatNumber(s.grams, 0)} g)
              </option>
            ))}
            <option value={GRAMS}>Grams (g)</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="meal" className={label}>
          Meal
        </label>
        <select id="meal" name="meal" defaultValue={meal} className={input}>
          {MEALS.map((m) => (
            <option key={m} value={m}>
              {MEAL_LABELS[m]}
            </option>
          ))}
        </select>
      </div>

      <section aria-label="Nutrition for this amount" aria-live="polite" className={`${card} text-center`}>
        {eaten === null || grams === null ? (
          <p className="text-muted">Enter an amount to see the nutrition.</p>
        ) : (
          <>
            <p className="text-3xl font-bold tracking-tight">
              {eaten.energy_kcal === undefined ? "–" : formatKcal(eaten.energy_kcal)}
              <span className="ml-1 text-base font-medium text-muted">kcal</span>
            </p>
            <p className="text-sm text-muted">{formatNumber(grams, 0)} g</p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <Macro name="Protein" value={eaten.protein} swatch="bg-protein" />
              <Macro name="Carbs" value={eaten.carbs} swatch="bg-carbs" />
              <Macro name="Fat" value={eaten.fat} swatch="bg-fat" />
            </dl>
          </>
        )}
      </section>

      <SubmitButton className={`${btnPrimary} w-full`}>{entry ? "Save changes" : "Add to diary"}</SubmitButton>
    </ActionForm>
  );
}

/**
 * The macro's colour is only a swatch beside its name. The number stays in the
 * normal text colour: the macro colours are bar fills (3:1 is enough), but are
 * too light to read as text on white (4.5:1 needed).
 */
function Macro({ name, value, swatch }: { name: string; value: number | undefined; swatch: string }) {
  return (
    <div>
      <dd className="text-lg font-semibold text-ink">{value === undefined ? "–" : `${formatNumber(value)} g`}</dd>
      <dt className="flex items-center justify-center gap-1.5 text-muted">
        <span aria-hidden className={`size-2.5 rounded-full ${swatch}`} />
        {name}
      </dt>
    </div>
  );
}
