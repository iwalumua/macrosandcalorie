"use client";

import { useState } from "react";
import { formatNumber } from "@/lib/format";
import { macroGramsFromSplit } from "@/lib/nutrition";
import type { FormState } from "@/server/form";
import { ActionForm, SubmitButton } from "../_components/forms";
import { btnPrimary, input, label } from "../_components/styles";

const toNumber = (s: string) => {
  const n = Number(s.trim().replace(",", "."));
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};

/** Calorie goal plus a protein/carb/fat split, showing the resulting grams as you type. */
export function GoalForm({
  action,
  initial,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial: { kcal: number; protein: number; carbs: number; fat: number };
}) {
  const [kcal, setKcal] = useState(String(initial.kcal));
  const [p, setP] = useState(String(initial.protein));
  const [c, setC] = useState(String(initial.carbs));
  const [f, setF] = useState(String(initial.fat));

  const total = (toNumber(p) ?? 0) + (toNumber(c) ?? 0) + (toNumber(f) ?? 0);
  const sumsTo100 = Math.abs(total - 100) <= 0.5;
  const goal = toNumber(kcal);
  const grams =
    goal !== null && goal >= 0 && sumsTo100
      ? macroGramsFromSplit(goal, { protein: toNumber(p) ?? 0, carbs: toNumber(c) ?? 0, fat: toNumber(f) ?? 0 })
      : null;

  return (
    <ActionForm action={action} className="space-y-4">
      <div>
        <label htmlFor="kcal" className={label}>
          Daily calories
        </label>
        <input
          id="kcal"
          name="kcal"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          required
          value={kcal}
          onChange={(e) => setKcal(e.target.value)}
          className={input}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Percent id="splitProtein" name="Protein %" value={p} onChange={setP} />
        <Percent id="splitCarbs" name="Carbs %" value={c} onChange={setC} />
        <Percent id="splitFat" name="Fat %" value={f} onChange={setF} />
      </div>

      <p role="status" className={`text-sm ${sumsTo100 ? "text-muted" : "font-medium text-over"}`}>
        {sumsTo100
          ? grams
            ? `That is ${formatNumber(grams.protein!, 0)} g protein, ${formatNumber(grams.carbs!, 0)} g carbs and ${formatNumber(grams.fat!, 0)} g fat a day.`
            : "Enter your calories to see the grams."
          : `The split adds up to ${formatNumber(total, 0)}%. It needs to be 100%.`}
      </p>

      <SubmitButton className={`${btnPrimary} w-full`}>Save goal</SubmitButton>
    </ActionForm>
  );
}

function Percent({
  id,
  name,
  value,
  onChange,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={label}>
        {name}
      </label>
      <input
        id={id}
        name={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={input}
      />
    </div>
  );
}
