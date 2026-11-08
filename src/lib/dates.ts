/**
 * Calendar-day helpers. A diary day is the user's *local* calendar day as a
 * `YYYY-MM-DD` string, never a timestamp, so these work on strings and do all
 * arithmetic in UTC to stay clear of daylight-saving surprises.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written as `YYYY-MM-DD` (rejects `2026-02-31`). */
export function isDateString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The calendar day it currently is in `timeZone`, as `YYYY-MM-DD`. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Shift a `YYYY-MM-DD` day by a whole number of days. */
export function addDays(date: string, days: number): string {
  if (!isDateString(date)) throw new RangeError(`not a date: ${date}`);
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Human label for a day relative to `today`: "Today", "Yesterday", or "Mon, Mar 9". */
export function formatDayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  if (date === addDays(today, 1)) return "Tomorrow";
  return formatDayLong(date, { year: date.slice(0, 4) !== today.slice(0, 4) });
}

/** "Monday, March 9" (optionally with the year). */
export function formatDayLong(date: string, opts: { year?: boolean } = {}): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(opts.year ? { year: "numeric" } : {}),
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
