import type { NutrientDirection } from "../db/nutrient-catalog";
import type { NutrientStatus } from "./summary";

/** Format a number with thousands separators and at most `maxDecimals` decimals ("1,234.5"). */
export function formatNumber(value: number, maxDecimals = 1): string {
  const v = Object.is(value, -0) ? 0 : value;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: maxDecimals }).format(v);
}

/** Whole calories: "1,234". */
export function formatKcal(value: number): string {
  return formatNumber(Math.round(value), 0);
}

/**
 * An amount with a sensible number of decimals for its size and unit, without
 * the unit: 1234.5 -> "1,235", 12.34 -> "12.3", 0.045 -> "0.05".
 */
export function formatQuantity(value: number, unit: string): string {
  const v = Math.abs(value);
  let decimals: number;
  if (unit === "kcal" || v >= 100) decimals = 0;
  else if (v >= 1) decimals = 1;
  else decimals = 2;
  return formatNumber(value, decimals);
}

/** An amount with its unit: "12.3 g", "1,235 mg", "850 kcal". */
export function formatAmount(value: number, unit: string): string {
  return `${formatQuantity(value, unit)} ${unit}`;
}

/** Whole-number percent: "73%". */
export function formatPercent(value: number): string {
  return `${formatNumber(Math.round(value), 0)}%`;
}

/** "45 min", "1 h", "1 h 30 min". */
export function formatMinutes(minutes: number): string {
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** A status in words, because colour alone must never carry meaning. */
export function statusLabel(status: NutrientStatus, direction: NutrientDirection): string {
  switch (status) {
    case "no_target":
      return "No target";
    case "no_data":
      return "No data";
    case "good":
      return direction === "limit" ? "Within limit" : direction === "budget" ? "On target" : "Met";
    case "near":
      return direction === "limit" ? "Near limit" : "Almost";
    case "low":
      return direction === "budget" ? "Under" : "Low";
    case "over":
      return direction === "limit" ? "Over limit" : "Over";
  }
}

/** Tone used to colour a status. */
export type Tone = "good" | "near" | "low" | "over" | "muted";

export function toneOf(status: NutrientStatus): Tone {
  switch (status) {
    case "good":
    case "near":
    case "low":
    case "over":
      return status;
    default:
      return "muted";
  }
}
