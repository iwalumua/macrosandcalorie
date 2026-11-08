import { Check, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/client";
import { SUPPLEMENT_TIMINGS } from "@/db/mutations";
import { getDiaryDay, listSupplementProducts, type SupplementProductView } from "@/db/queries";
import { formatNumber } from "@/lib/format";
import { getCurrentUser, getToday, resolveDate } from "@/server/context";
import { DateNav } from "../_components/DateNav";
import { SubmitButton } from "../_components/forms";
import { btnGhost, btnPrimary, btnSecondary, hint, input, label } from "../_components/styles";
import { Card, EmptyState, PageHeader, SectionTitle } from "../_components/ui";
import {
  logStackAction,
  logSupplementAction,
  removeStackItemAction,
  setStackItemAction,
} from "./actions";

export const metadata: Metadata = { title: "Supplements" };

const TIMING_LABEL: Record<string, string> = {
  morning: "Morning",
  midday: "Midday",
  evening: "Evening",
  bedtime: "Bedtime",
  with_meal: "With a meal",
  anytime: "Any time",
};

export default async function SupplementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  const date = await resolveDate((await searchParams).date);
  const today = await getToday();
  const [products, day] = await Promise.all([
    listSupplementProducts(getDb(), user.id),
    getDiaryDay(getDb(), user.id, date),
  ]);

  const takenServings = new Map<string, number>();
  for (const l of day.supplementLogs) takenServings.set(l.productId, (takenServings.get(l.productId) ?? 0) + l.servings);

  const stack = products.filter((p) => p.stack?.active);
  const groups = [...SUPPLEMENT_TIMINGS, "anytime"]
    .map((t) => ({
      timing: t,
      items: stack.filter((p) => (p.stack!.timing ?? "anytime") === t),
    }))
    .filter((g) => g.items.length > 0);
  const returnTo = `/supplements?date=${date}`;

  return (
    <>
      <PageHeader
        title="Supplements"
        action={
          <Link href="/supplements/new" className={`${btnSecondary} gap-1.5 px-4`}>
            <Plus aria-hidden className="size-5" />
            New
          </Link>
        }
      />
      <DateNav date={date} today={today} basePath="/supplements" />

      <h2 className="mb-2 text-sm font-semibold text-muted">My stack</h2>
      {groups.length === 0 ? (
        <div className="mb-6">
          <EmptyState title="No regular supplements yet">
            Add a supplement, then put it in your stack to log it with one tap each day.
          </EmptyState>
        </div>
      ) : (
        groups.map((g) => {
          const remaining = g.items.filter((p) => !takenServings.has(p.id)).length;
          return (
            <Card key={g.timing} className="mb-4" aria-label={`${TIMING_LABEL[g.timing]} supplements`}>
              <SectionTitle
                action={
                  remaining > 0 ? (
                    <form action={logStackAction}>
                      <input type="hidden" name="date" value={date} />
                      <input type="hidden" name="timing" value={g.timing === "anytime" ? "" : g.timing} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <SubmitButton className={`${btnPrimary} min-h-11 px-4 text-sm`} pendingLabel="Logging…">
                        Log {remaining === g.items.length ? "all" : `${remaining} left`}
                      </SubmitButton>
                    </form>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-good">
                      <Check aria-hidden className="size-4" strokeWidth={3} />
                      All taken
                    </span>
                  )
                }
              >
                {TIMING_LABEL[g.timing]}
              </SectionTitle>
              <ul>
                {g.items.map((p) => (
                  <StackRow key={p.id} product={p} date={date} taken={takenServings.get(p.id)} returnTo={returnTo} />
                ))}
              </ul>
            </Card>
          );
        })
      )}

      <h2 className="mb-2 mt-6 text-sm font-semibold text-muted">All supplements</h2>
      {products.length === 0 ? (
        <EmptyState title="Nothing here yet">
          Enter a supplement from its label to count its vitamins and minerals toward your day.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {products.map((p) => (
            <li key={p.id}>
              <ProductCard product={p} date={date} returnTo={returnTo} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function StackRow({
  product,
  date,
  taken,
  returnTo,
}: {
  product: SupplementProductView;
  date: string;
  taken: number | undefined;
  returnTo: string;
}) {
  const dose = product.stack!.servingsPerDose;
  return (
    <li className="flex items-center gap-2 border-b border-line py-1 last:border-b-0">
      <div className="min-w-0 flex-1 py-2">
        <p className="truncate font-medium">{product.name}</p>
        <p className="truncate text-sm text-muted">
          {formatNumber(dose)} × {product.servingLabel}
        </p>
      </div>
      <form action={logSupplementAction}>
        <input type="hidden" name="productId" value={product.id} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="servings" value={dose} />
        <input type="hidden" name="returnTo" value={returnTo} />
        {taken === undefined ? (
          <SubmitButton className={`${btnSecondary} min-h-11 px-4`} pendingLabel="Logging…">
            Log
          </SubmitButton>
        ) : (
          <SubmitButton
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-good-soft px-4 text-sm font-semibold text-good active:opacity-80"
            ariaLabel={`Taken: ${formatNumber(taken)} servings of ${product.name}. Log another dose.`}
            pendingLabel="Logging…"
          >
            <Check aria-hidden className="size-4" strokeWidth={3} />
            Taken
          </SubmitButton>
        )}
      </form>
    </li>
  );
}

function ProductCard({
  product,
  date,
  returnTo,
}: {
  product: SupplementProductView;
  date: string;
  returnTo: string;
}) {
  const nutrientCount = Object.keys(product.perServing).length;
  const inStack = product.stack?.active === true;
  return (
    <Card as="article">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{product.name}</h3>
          <p className="truncate text-sm text-muted">
            {product.brand ? `${product.brand} · ` : ""}
            {product.servingLabel} · {nutrientCount} nutrient{nutrientCount === 1 ? "" : "s"}
          </p>
        </div>
        {inStack ? (
          <span className="shrink-0 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">In stack</span>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <form action={logSupplementAction}>
          <input type="hidden" name="productId" value={product.id} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="servings" value="1" />
          <input type="hidden" name="returnTo" value={returnTo} />
          <SubmitButton className={`${btnSecondary} min-h-11 px-4`} pendingLabel="Logging…">
            Log 1 serving
          </SubmitButton>
        </form>
      </div>

      <details className="mt-1">
        <summary className={`${btnGhost} -ml-3 cursor-pointer list-none`}>{inStack ? "Edit stack settings" : "Add to my stack"}</summary>
        <form action={setStackItemAction} className="space-y-3 pt-2">
          <input type="hidden" name="productId" value={product.id} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`dose-${product.id}`} className={label}>
                Servings per dose
              </label>
              <input
                id={`dose-${product.id}`}
                name="servingsPerDose"
                type="text"
                inputMode="decimal"
                defaultValue={product.stack?.servingsPerDose ?? 1}
                className={input}
              />
            </div>
            <div>
              <label htmlFor={`timing-${product.id}`} className={label}>
                When
              </label>
              <select id={`timing-${product.id}`} name="timing" defaultValue={product.stack?.timing ?? ""} className={input}>
                <option value="">Any time</option>
                {SUPPLEMENT_TIMINGS.map((t) => (
                  <option key={t} value={t}>
                    {TIMING_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <SubmitButton className={`${btnPrimary} w-full`}>{inStack ? "Save" : "Add to stack"}</SubmitButton>
        </form>
        {product.stack ? (
          <form action={removeStackItemAction} className="pt-2">
            <input type="hidden" name="productId" value={product.id} />
            <SubmitButton className={`${btnSecondary} w-full`} pendingLabel="Removing…">
              Remove from stack
            </SubmitButton>
            <p className={hint}>Past days keep what you already logged.</p>
          </form>
        ) : null}
      </details>
    </Card>
  );
}
