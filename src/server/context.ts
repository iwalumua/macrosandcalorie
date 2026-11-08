import { cookies } from "next/headers";
import { cache } from "react";
import { getDb } from "../db/client";
import { ensureLocalUser } from "../db/mutations";
import { isDateString, isValidTimeZone, todayIn } from "../lib/dates";

/** Cookie holding the browser's IANA time zone, so "today" is the user's today. */
export const TZ_COOKIE = "tz";

/**
 * The current user. There is no login yet (auth is undecided, see
 * docs/DECISIONS.md), so every request acts as one built-in user. That is fine
 * on your own machine and unsafe on the open internet, so in production it
 * refuses to run unless SINGLE_USER_MODE=true is set deliberately.
 */
export const getCurrentUser = cache(async () => {
  if (process.env.NODE_ENV === "production" && process.env.SINGLE_USER_MODE !== "true") {
    throw new Error(
      "This app has no login yet. Set SINGLE_USER_MODE=true only for a private deployment " +
        "that nobody else can reach. See docs/DECISIONS.md.",
    );
  }
  return ensureLocalUser(getDb());
});

/** The browser's time zone from its cookie, falling back to the user's saved one. */
export async function getTimeZone(): Promise<string> {
  const fromCookie = (await cookies()).get(TZ_COOKIE)?.value;
  if (fromCookie && isValidTimeZone(fromCookie)) return fromCookie;
  return (await getCurrentUser()).timezone;
}

export async function getToday(): Promise<string> {
  return todayIn(await getTimeZone());
}

/** A `?date=` search param if it is a real date, otherwise today. */
export async function resolveDate(raw: string | string[] | undefined): Promise<string> {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return isDateString(value) ? value : getToday();
}
