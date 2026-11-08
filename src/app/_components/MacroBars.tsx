import { formatNumber, formatPercent } from "@/lib/format";
import type { MacroRow } from "@/lib/summary";
import { Meter } from "./ui";

const COLOR: Record<MacroRow["key"], string> = {
  protein: "bg-protein",
  carbs: "bg-carbs",
  fat: "bg-fat",
};

/** Protein, carbs and fat: grams against target, and each one's share of the day's calories. */
export function MacroBars({ macros }: { macros: MacroRow[] }) {
  return (
    <ul className="space-y-3">
      {macros.map((m) => (
        <li key={m.key}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-ink">{m.name}</span>
            <span className="text-muted">
              <span className="font-semibold text-ink">{formatNumber(m.grams, 0)}</span>
              {m.target !== null ? ` / ${formatNumber(m.target, 0)} g` : " g"}
              {m.grams > 0 ? ` · ${formatPercent(m.percentOfCalories)} of calories` : null}
            </span>
          </div>
          <Meter
            percent={m.percentOfTarget}
            color={COLOR[m.key]}
            label={m.name}
            valueText={
              m.percentOfTarget === null
                ? `${formatNumber(m.grams, 0)} grams, no target`
                : `${formatPercent(m.percentOfTarget)} of target`
            }
            height="h-2.5"
          />
        </li>
      ))}
    </ul>
  );
}
