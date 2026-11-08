"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { syncTimezoneAction } from "../actions";

/**
 * Tells the server which time zone this browser is in, so "today" is the
 * user's today. Renders nothing; runs once, and refreshes only if the saved
 * zone was missing or different.
 */
export function TimezoneSync({ current }: { current: string }) {
  const router = useRouter();
  useEffect(() => {
    let zone: string;
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!zone || zone === current) return;
    syncTimezoneAction(zone).then(() => router.refresh());
  }, [current, router]);
  return null;
}
