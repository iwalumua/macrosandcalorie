import type { Metadata } from "next";
import { isDateString } from "@/lib/dates";
import { isMeal } from "@/lib/meals";
import { ActionForm, SubmitButton } from "../../_components/forms";
import { NutrientFields } from "../../_components/NutrientFields";
import { btnPrimary, hint, input, label } from "../../_components/styles";
import { PageHeader } from "../../_components/ui";
import { createFoodAction } from "../actions";

export const metadata: Metadata = { title: "New food" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function NewFoodPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const date = first(sp.date);
  const meal = first(sp.meal);
  const name = first(sp.name) ?? "";
  const back = isDateString(date) && isMeal(meal) ? `/diary/add?date=${date}&meal=${meal}` : "/diary/add";

  return (
    <>
      <PageHeader
        title="New food"
        subtitle="Copy the values from the nutrition label."
        back={{ href: back, label: "Search" }}
      />
      <ActionForm action={createFoodAction} className="space-y-5">
        {isDateString(date) ? <input type="hidden" name="date" value={date} /> : null}
        {isMeal(meal) ? <input type="hidden" name="meal" value={meal} /> : null}

        <div>
          <label htmlFor="name" className={label}>
            Name
          </label>
          <input id="name" name="name" required maxLength={120} defaultValue={name} autoComplete="off" className={input} />
        </div>
        <div>
          <label htmlFor="brand" className={label}>
            Brand <span className="font-normal text-muted">(optional)</span>
          </label>
          <input id="brand" name="brand" maxLength={120} autoComplete="off" className={input} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="servingLabel" className={label}>
              Serving
            </label>
            <input id="servingLabel" name="servingLabel" defaultValue="1 serving" maxLength={120} className={input} />
          </div>
          <div>
            <label htmlFor="servingGrams" className={label}>
              Serving weight (g)
            </label>
            <input
              id="servingGrams"
              name="servingGrams"
              required
              type="text"
              inputMode="decimal"
              placeholder="e.g. 50"
              autoComplete="off"
              className={input}
            />
          </div>
        </div>
        <p className={`${hint} -mt-3`}>
          The label&apos;s serving, like &quot;1 bar&quot; or &quot;1 cup&quot;, and what it weighs. Millilitres are close
          enough to grams for most drinks.
        </p>

        <NutrientFields
          primary={["energy_kcal", "protein", "carbs", "fat"]}
          primaryTitle="Nutrition per serving"
          moreTitle="Fiber, sodium, vitamins and more"
        />

        <SubmitButton className={`${btnPrimary} w-full`}>Save food</SubmitButton>
      </ActionForm>
    </>
  );
}
