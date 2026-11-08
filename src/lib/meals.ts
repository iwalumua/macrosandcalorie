/** The meals a diary day is split into. Must match the `meal_type` enum in src/db/schema.ts (a test checks). */
export const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type Meal = (typeof MEALS)[number];

export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
};

export function isMeal(value: unknown): value is Meal {
  return typeof value === "string" && (MEALS as readonly string[]).includes(value);
}
