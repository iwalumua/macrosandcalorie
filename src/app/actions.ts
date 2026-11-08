"use server";

import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { setUserTimezone } from "@/db/mutations";
import { isValidTimeZone } from "@/lib/dates";
import { getCurrentUser, TZ_COOKIE } from "@/server/context";

/**
 * Remember the browser's time zone, so "today" and every diary day follow the
 * user's own clock rather than the server's. Called once by <TimezoneSync />.
 */
export async function syncTimezoneAction(timeZone: string): Promise<void> {
  if (typeof timeZone !== "string" || timeZone.length > 64 || !isValidTimeZone(timeZone)) return;
  (await cookies()).set(TZ_COOKIE, timeZone, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  const user = await getCurrentUser();
  if (user.timezone !== timeZone) await setUserTimezone(getDb(), user.id, timeZone);
}
