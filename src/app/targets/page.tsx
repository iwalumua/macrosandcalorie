import { RotateCcw } from "lucide-react";
import type { Metadata } from "next";
import { getDb } from "@/db/client";
import { NUTRIENT_CATALOG, type NutrientCategory } from "@/db/nutrient-catalog";
import { getTargetOverrides } from "@/db/queries";
import { formatAmount } from "@/lib/format";
import { macroSplitFromGrams } from "@/lib/nutrition";
import { resolveTargets } from "@/lib/targets";
import { getCurrentUser } from "@/server/context";
import { ActionForm, SubmitButton } from "../_components/forms";
import { btnPrimary, btnSecondary, hint, input } from "../_components/styles";
import { Card, PageHeader, SectionTitle } from "../_components/ui";
import { GoalForm } from "./GoalForm";
import { resetAllTargetsAction, saveGoalAction, saveNutrientTargetsAction } from "./actions";

export const metadata: Metadata = { title: "Targets" };

const FROM_GOAL = new Set(["energy_kcal", "protein", "carbs", "fat"]);

const SECTIONS: { category: NutrientCategory; title: string }[] = [
  { category: "macro", title: "Fiber and sugars" },
  { category: "lipid", title: "Fats" },
  { category: "vitamin", title: "Vitamins" },
  { category: "mineral", title: "Minerals" },
  { category: "other", title: "Other" },
];

const SAVED: Record<string, string> = {
  goal: "Calorie goal saved.",
  nutrients: "Nutrient targets saved.",
  reset: "Back to the default targets.",
};

/** A number for an input's value, without floating-point noise (0.30000000000000004 -> 0.3). */
const forInput = (n: number | null | undefined) => (n == null ? "" : String(Math.round(n * 1000) / 1000));

export default async function TargetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  const saved = (await searchParams).saved;
  const overrides = await getTargetOverrides(getDb(), user.id);
  const targets = resolveTargets(NUTRIENT_CATALOG, overrides);
  const customCount = Object.keys(overrides).length;

  const kcal = targets.energy_kcal?.target ?? 2000;
  const grams = {
    protein: targets.protein?.target ?? 0,
    carbs: targets.carbs?.target ?? 0,
    fat: targets.fat?.target ?? 0,
  };
  const split = macroSplitFromGrams(grams);
  const hasSplit = split.protein + split.carbs + split.fat === 100;
  const initial = { kcal, ...(hasSplit ? split : { protein: 20, carbs: 50, fat: 30 }) };

  const savedMessage = typeof saved === "string" ? SAVED[saved] : undefined;

  return (
    <>
      <PageHeader title="Targets" subtitle="What each day is measured against." />

      {savedMessage ? (
        <p role="status" className="mb-4 rounded-xl bg-good-soft p-3 text-sm font-medium text-good">
          {savedMessage}
        </p>
      ) : null}

      <Card className="mb-4" aria-labelledby="goal-heading">
        <SectionTitle>
          <span id="goal-heading">Calories and macros</span>
        </SectionTitle>
        <GoalForm action={saveGoalAction} initial={initial} />
        {!targets.energy_kcal?.custom ? (
          <p className={hint}>
            Showing the generic default: a 2,000-calorie diet at the FDA Daily Values. Set your own goal above.
          </p>
        ) : null}
      </Card>

      <Card className="mb-4" aria-labelledby="nutrients-heading">
        <SectionTitle>
          <span id="nutrients-heading">Vitamins, minerals and more</span>
        </SectionTitle>
        <p className="mb-3 text-sm text-muted">
          These start as the FDA Daily Values for adults, a general reference rather than advice for you. Change any
          that your doctor or dietitian has set differently. Only the ones you edit are saved.
        </p>

        <ActionForm action={saveNutrientTargetsAction} className="space-y-3">
          {SECTIONS.map(({ category, title }) => {
            const rows = NUTRIENT_CATALOG.filter((n) => n.category === category && !FROM_GOAL.has(n.key));
            if (rows.length === 0) return null;
            return (
              <details key={category} className="rounded-xl border border-line">
                <summary className="flex min-h-12 cursor-pointer items-center justify-between px-3 text-base font-semibold">
                  {title}
                  <span className="text-sm font-normal text-muted">{rows.length}</span>
                </summary>
                <div className="space-y-4 px-3 pb-3">
                  {rows.map((n) => {
                    const t = targets[n.key]!;
                    const isLimit = t.direction === "limit";
                    return (
                      <div key={n.key}>
                        <p className="mb-1 flex items-baseline justify-between gap-2 text-sm font-medium">
                          <span>{n.name}</span>
                          {t.custom ? (
                            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">
                              Custom
                            </span>
                          ) : null}
                        </p>
                        <div className={t.upperLimit !== null || n.upperLimit !== undefined ? "grid grid-cols-2 gap-3" : ""}>
                          <div>
                            <label htmlFor={`t_${n.key}`} className="mb-1 block text-xs text-muted">
                              {isLimit ? "Stay under" : "Daily target"} ({n.unit})
                            </label>
                            <input
                              id={`t_${n.key}`}
                              name={`t_${n.key}`}
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              defaultValue={forInput(t.target)}
                              placeholder="none"
                              className={input}
                            />
                            <input type="hidden" name={`o_${n.key}`} value={forInput(t.target)} />
                          </div>
                          {t.upperLimit !== null || n.upperLimit !== undefined ? (
                            <div>
                              <label htmlFor={`u_${n.key}`} className="mb-1 block text-xs text-muted">
                                Upper limit ({n.unit}
                                {t.upperLimitScope === "supplements" ? ", supplements" : ""})
                              </label>
                              <input
                                id={`u_${n.key}`}
                                name={`u_${n.key}`}
                                type="text"
                                inputMode="decimal"
                                autoComplete="off"
                                defaultValue={forInput(t.upperLimit)}
                                placeholder="none"
                                className={input}
                              />
                              <input type="hidden" name={`ou_${n.key}`} value={forInput(t.upperLimit)} />
                            </div>
                          ) : null}
                        </div>
                        {n.dailyValue !== undefined && t.custom ? (
                          <p className="mt-1 text-xs text-muted">Default: {formatAmount(n.dailyValue, n.unit)}</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </details>
            );
          })}
          <SubmitButton className={`${btnPrimary} w-full`}>Save nutrient targets</SubmitButton>
        </ActionForm>
      </Card>

      {customCount > 0 ? (
        <Card className="mb-2">
          <form action={resetAllTargetsAction}>
            <SubmitButton className={`${btnSecondary} w-full`} pendingLabel="Resetting…">
              <RotateCcw aria-hidden className="size-5" />
              Reset all to defaults
            </SubmitButton>
          </form>
          <p className={hint}>
            Removes your {customCount} custom target{customCount === 1 ? "" : "s"}. Nothing you have logged changes.
          </p>
        </Card>
      ) : null}
    </>
  );
}
