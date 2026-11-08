import type { Metadata } from "next";
import { SUPPLEMENT_TIMINGS } from "@/db/mutations";
import { ActionForm, SubmitButton } from "../../_components/forms";
import { NutrientFields } from "../../_components/NutrientFields";
import { btnPrimary, hint, input, label } from "../../_components/styles";
import { PageHeader } from "../../_components/ui";
import { createSupplementAction } from "../actions";

export const metadata: Metadata = { title: "New supplement" };

const TIMING_LABEL: Record<string, string> = {
  morning: "Morning",
  midday: "Midday",
  evening: "Evening",
  bedtime: "Bedtime",
  with_meal: "With a meal",
};

export default function NewSupplementPage() {
  return (
    <>
      <PageHeader
        title="New supplement"
        subtitle="Copy the amounts from the Supplement Facts panel."
        back={{ href: "/supplements", label: "Supplements" }}
      />
      <ActionForm action={createSupplementAction} className="space-y-5">
        <div>
          <label htmlFor="name" className={label}>
            Name
          </label>
          <input id="name" name="name" required maxLength={120} autoComplete="off" className={input} />
        </div>
        <div>
          <label htmlFor="brand" className={label}>
            Brand <span className="font-normal text-muted">(optional)</span>
          </label>
          <input id="brand" name="brand" maxLength={120} autoComplete="off" className={input} />
        </div>
        <div>
          <label htmlFor="servingLabel" className={label}>
            One serving is
          </label>
          <input
            id="servingLabel"
            name="servingLabel"
            defaultValue="1 capsule"
            maxLength={120}
            className={input}
          />
          <p className={hint}>For example &quot;1 capsule&quot;, &quot;2 gummies&quot; or &quot;1 scoop&quot;.</p>
        </div>

        <NutrientFields
          primary={["vit_d", "vit_c", "vit_b12", "calcium", "magnesium", "iron", "zinc", "omega3_dha", "omega3_epa"]}
          primaryTitle="Amount per serving"
          moreTitle="All other nutrients"
        />

        <fieldset className="space-y-3 rounded-2xl border border-line bg-surface p-4">
          <legend className="px-1 text-base font-semibold">My stack</legend>
          <label className="flex min-h-12 items-center gap-3 text-base">
            <input type="checkbox" name="addToStack" defaultChecked className="size-5 accent-[var(--primary)]" />
            Add to my daily stack
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="servingsPerDose" className={label}>
                Servings per dose
              </label>
              <input id="servingsPerDose" name="servingsPerDose" type="text" inputMode="decimal" defaultValue="1" className={input} />
            </div>
            <div>
              <label htmlFor="timing" className={label}>
                When
              </label>
              <select id="timing" name="timing" defaultValue="morning" className={input}>
                <option value="">Any time</option>
                {SUPPLEMENT_TIMINGS.map((t) => (
                  <option key={t} value={t}>
                    {TIMING_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>

        <SubmitButton className={`${btnPrimary} w-full`}>Save supplement</SubmitButton>
      </ActionForm>
    </>
  );
}
