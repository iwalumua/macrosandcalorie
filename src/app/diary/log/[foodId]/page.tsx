import { Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { getDiaryDay, getFood } from "@/db/queries";
import { isMeal, type Meal } from "@/lib/meals";
import { getCurrentUser, resolveDate } from "@/server/context";
import { SubmitButton } from "../../../_components/forms";
import { btnDanger } from "../../../_components/styles";
import { Card, PageHeader } from "../../../_components/ui";
import { deleteEntryAction, logFoodAction } from "../../actions";
import { LogFoodForm } from "./LogFoodForm";

export const metadata: Metadata = { title: "Log food" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function LogFoodPage({
  params,
  searchParams,
}: {
  params: Promise<{ foodId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { foodId } = await params;
  if (!UUID.test(foodId)) notFound();

  const sp = await searchParams;
  const user = await getCurrentUser();
  const date = await resolveDate(sp.date);
  const food = await getFood(getDb(), user.id, foodId);
  if (!food) notFound();

  // When editing, the entry must exist, belong to this user (getDiaryDay is scoped to them) and be of this food.
  const entryId = first(sp.entry);
  const existing =
    entryId && UUID.test(entryId)
      ? (await getDiaryDay(getDb(), user.id, date)).entries.find((e) => e.id === entryId && e.foodId === foodId)
      : undefined;

  const mealParam = first(sp.meal);
  const meal: Meal = existing?.meal ?? (isMeal(mealParam) ? mealParam : "breakfast");

  return (
    <>
      <PageHeader
        title={food.name}
        subtitle={food.brand ?? (food.custom ? "Your food" : undefined)}
        back={
          existing
            ? { href: `/diary?date=${date}`, label: "Diary" }
            : { href: `/diary/add?date=${date}&meal=${meal}`, label: "Search" }
        }
      />
      <LogFoodForm
        action={logFoodAction}
        food={{ id: food.id, servings: food.servings, per100g: food.per100g }}
        date={date}
        meal={meal}
        entry={existing ? { id: existing.id, quantity: existing.quantity, servingId: existing.servingId } : undefined}
      />

      {existing ? (
        <Card className="mt-6">
          <form action={deleteEntryAction}>
            <input type="hidden" name="id" value={existing.id} />
            <input type="hidden" name="date" value={date} />
            <SubmitButton className={`${btnDanger} w-full`} pendingLabel="Removing…">
              <Trash2 aria-hidden className="size-5" />
              Remove from diary
            </SubmitButton>
          </form>
        </Card>
      ) : null}
    </>
  );
}
