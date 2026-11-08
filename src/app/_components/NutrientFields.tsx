import { NUTRIENT_CATALOG, type NutrientCategory, type NutrientDef } from "@/db/nutrient-catalog";
import { nutrientField } from "@/server/nutrient-fields";
import { hint, input, label } from "./styles";

const CATEGORY_TITLES: Record<NutrientCategory, string> = {
  energy: "Energy",
  macro: "Macros",
  lipid: "Fats",
  vitamin: "Vitamins",
  mineral: "Minerals",
  other: "Other",
};

function Field({ n }: { n: NutrientDef }) {
  const id = `nf-${n.key}`;
  return (
    <div>
      <label htmlFor={id} className={label}>
        {n.name} <span className="font-normal text-muted">({n.unit})</span>
      </label>
      <input
        id={id}
        name={nutrientField(n.key)}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="–"
        className={input}
      />
    </div>
  );
}

/**
 * Inputs for the values printed on a label. The nutrients in `primary` are
 * always visible; every other tracked nutrient sits in a collapsed section.
 * Leaving a field blank means "not on the label", which is stored as unknown
 * and is not the same as 0.
 */
export function NutrientFields({
  primary,
  primaryTitle,
  moreTitle = "More nutrients",
}: {
  primary: readonly string[];
  primaryTitle: string;
  moreTitle?: string;
}) {
  const byKey = new Map(NUTRIENT_CATALOG.map((n) => [n.key, n]));
  const shown = primary.flatMap((k) => (byKey.has(k) ? [byKey.get(k)!] : []));
  const rest = NUTRIENT_CATALOG.filter((n) => !primary.includes(n.key));
  const categories = [...new Set(rest.map((n) => n.category))];

  return (
    <>
      <fieldset>
        <legend className="mb-2 text-base font-semibold text-ink">{primaryTitle}</legend>
        <div className="grid grid-cols-2 gap-3">
          {shown.map((n) => (
            <Field key={n.key} n={n} />
          ))}
        </div>
        <p className={hint}>Leave a box empty if it is not on the label. Empty is not the same as 0.</p>
      </fieldset>

      <details className="rounded-2xl border border-line bg-surface">
        <summary className="flex min-h-12 cursor-pointer items-center px-4 text-base font-semibold text-primary">
          {moreTitle}
        </summary>
        <div className="space-y-5 px-4 pb-4">
          {categories.map((c) => (
            <fieldset key={c}>
              <legend className="mb-2 text-sm font-semibold text-muted">{CATEGORY_TITLES[c]}</legend>
              <div className="grid grid-cols-2 gap-3">
                {rest
                  .filter((n) => n.category === c)
                  .map((n) => (
                    <Field key={n.key} n={n} />
                  ))}
              </div>
            </fieldset>
          ))}
        </div>
      </details>
    </>
  );
}
