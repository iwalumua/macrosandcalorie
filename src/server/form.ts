import { isDateString } from "../lib/dates";
import { InputError } from "../lib/errors";
import { isMeal, type Meal } from "../lib/meals";

/**
 * Helpers for reading `FormData` in server actions. Server actions are public
 * endpoints, so nothing from a form is trusted: every value is parsed and
 * validated here before it reaches the database.
 */

export type FormState = { error?: string } | undefined;

/** Turn a thrown error into form state: input errors are shown, anything else is hidden. */
export function toFormState(error: unknown): FormState {
  if (error instanceof InputError) return { error: error.message };
  console.error(error);
  return { error: "Something went wrong. Please try again." };
}

export function text(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Parse a number the way people type it, accepting a decimal comma ("1,5").
 * Returns undefined for a blank field, which means "not entered", never 0.
 */
export function optionalNumber(fd: FormData, key: string, label = key): number | undefined {
  const raw = text(fd, key).replace(/\s/g, "");
  if (raw === "") return undefined;
  const normalised = /^\d+,\d+$/.test(raw) ? raw.replace(",", ".") : raw;
  if (!/^-?\d*\.?\d+$/.test(normalised) && !/^-?\d+\.$/.test(normalised)) {
    throw new InputError(`${label} must be a number.`);
  }
  const n = Number(normalised);
  if (!Number.isFinite(n)) throw new InputError(`${label} must be a number.`);
  return n;
}

export function requiredNumber(fd: FormData, key: string, label = key): number {
  const n = optionalNumber(fd, key, label);
  if (n === undefined) throw new InputError(`${label} is required.`);
  return n;
}

export function dateField(fd: FormData, key = "date"): string {
  const v = text(fd, key);
  if (!isDateString(v)) throw new InputError("That date is not valid.");
  return v;
}

export function mealField(fd: FormData, key = "meal"): Meal {
  const v = text(fd, key);
  if (!isMeal(v)) throw new InputError("Choose a meal.");
  return v;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function idField(fd: FormData, key: string): string {
  const v = text(fd, key);
  if (!UUID.test(v)) throw new InputError("That item could not be found.");
  return v;
}

export function optionalIdField(fd: FormData, key: string): string | null {
  return text(fd, key) === "" ? null : idField(fd, key);
}

/** Only allow redirects to paths inside this app. */
export function safeReturnPath(value: string, fallback: string): string {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : fallback;
}
