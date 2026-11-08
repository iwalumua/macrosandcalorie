import { Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/client";
import { listRecentFoods, searchFoods, type FoodListItem } from "@/db/queries";
import { formatKcal, formatNumber } from "@/lib/format";
import { isMeal, MEAL_LABELS, MEALS, type Meal } from "@/lib/meals";
import { getCurrentUser, resolveDate } from "@/server/context";
import { btnPrimary, btnSecondary, input } from "../../_components/styles";
import { EmptyState, PageHeader } from "../../_components/ui";

export const metadata: Metadata = { title: "Add food" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AddFoodPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const date = await resolveDate(sp.date);
  const mealParam = first(sp.meal);
  const meal: Meal = isMeal(mealParam) ? mealParam : "breakfast";
  const q = (first(sp.q) ?? "").trim();

  const results = q ? await searchFoods(getDb(), user.id, q) : await listRecentFoods(getDb(), user.id);
  const newFoodHref = `/foods/new?date=${date}&meal=${meal}${q ? `&name=${encodeURIComponent(q)}` : ""}`;

  return (
    <>
      <PageHeader title="Add food" back={{ href: `/diary?date=${date}`, label: "Diary" }} />

      <nav aria-label="Meal" className="mb-3 grid grid-cols-4 gap-1 rounded-2xl border border-line bg-surface p-1">
        {MEALS.map((m) => (
          <Link
            key={m}
            href={`/diary/add?date=${date}&meal=${m}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            aria-current={m === meal ? "true" : undefined}
            className={`flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold ${
              m === meal ? "bg-primary text-on-primary" : "text-muted"
            }`}
          >
            {MEAL_LABELS[m]}
          </Link>
        ))}
      </nav>

      <form action="/diary/add" method="get" role="search" className="mb-4 flex gap-2">
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="meal" value={meal} />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search foods"
          aria-label="Search foods"
          enterKeyHint="search"
          autoComplete="off"
          autoFocus={!q}
          className={input}
        />
        <button type="submit" className={`${btnPrimary} px-4`} aria-label="Search">
          <Search aria-hidden className="size-5" />
        </button>
      </form>

      <h2 className="mb-2 text-sm font-semibold text-muted">{q ? `Results for “${q}”` : "Recently logged"}</h2>

      {results.length > 0 ? (
        <ul className="mb-4 overflow-hidden rounded-2xl border border-line bg-surface">
          {results.map((f) => (
            <FoodRow key={f.id} food={f} href={`/diary/log/${f.id}?date=${date}&meal=${meal}`} />
          ))}
        </ul>
      ) : (
        <div className="mb-4">
          <EmptyState title={q ? "No foods match that" : "Nothing logged yet"}>
            {q
              ? "Check the spelling, or add it yourself from the label."
              : "Search for a food above, or add one from its nutrition label."}
          </EmptyState>
        </div>
      )}

      <Link href={newFoodHref} className={`${btnSecondary} w-full gap-2`}>
        <Plus aria-hidden className="size-5" />
        {q ? `Create “${q}”` : "Create a custom food"}
      </Link>
    </>
  );
}

function FoodRow({ food, href }: { food: FoodListItem; href: string }) {
  const serving = food.defaultServing
    ? `${food.defaultServing.label} (${formatNumber(food.defaultServing.grams, 0)} g)`
    : "per 100 g";
  return (
    <li className="border-b border-line last:border-b-0">
      <Link href={href} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2 active:bg-surface-2">
        <span className="min-w-0">
          <span className="block truncate font-medium">{food.name}</span>
          <span className="block truncate text-sm text-muted">
            {food.brand ? `${food.brand} · ` : ""}
            {serving}
          </span>
        </span>
        <span className="shrink-0 text-right text-sm text-muted">
          {food.kcalPer100g === null ? null : (
            <>
              <span className="font-semibold text-ink">{formatKcal(food.kcalPer100g)}</span> kcal
              <br />/ 100 g
            </>
          )}
        </span>
      </Link>
    </li>
  );
}
