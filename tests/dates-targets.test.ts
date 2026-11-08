import { describe, expect, it } from "vitest";
import type { NutrientDef } from "../src/db/nutrient-catalog";
import { addDays, formatDayLabel, formatDayLong, isDateString, isValidTimeZone, todayIn } from "../src/lib/dates";
import { isMeal, MEALS } from "../src/lib/meals";
import { resolveTargets } from "../src/lib/targets";

describe("isDateString", () => {
  it("accepts real calendar dates only", () => {
    expect(isDateString("2026-03-10")).toBe(true);
    expect(isDateString("2024-02-29")).toBe(true); // leap day
    expect(isDateString("2026-02-29")).toBe(false);
    expect(isDateString("2026-02-31")).toBe(false);
    expect(isDateString("2026-13-01")).toBe(false);
    expect(isDateString("2026-3-1")).toBe(false);
    expect(isDateString("not a date")).toBe(false);
    expect(isDateString(undefined)).toBe(false);
  });
});

describe("todayIn", () => {
  // 2026-03-10 23:30 UTC is already the 11th in Auckland and still the 10th in New York.
  const instant = new Date("2026-03-10T23:30:00Z");
  it("returns the local calendar day for the given time zone", () => {
    expect(todayIn("UTC", instant)).toBe("2026-03-10");
    expect(todayIn("Pacific/Auckland", instant)).toBe("2026-03-11");
    expect(todayIn("America/New_York", instant)).toBe("2026-03-10");
  });
  it("validates time zone names", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
  });
});

describe("addDays", () => {
  it("moves across month, year and leap boundaries", () => {
    expect(addDays("2026-03-10", 1)).toBe("2026-03-11");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("is unaffected by daylight-saving changes", () => {
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09"); // US spring-forward day
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02"); // US fall-back day
  });
  it("rejects a non-date", () => {
    expect(() => addDays("nope", 1)).toThrow(RangeError);
  });
});

describe("day labels", () => {
  it("labels today, yesterday and tomorrow, otherwise the weekday and date", () => {
    expect(formatDayLabel("2026-03-10", "2026-03-10")).toBe("Today");
    expect(formatDayLabel("2026-03-09", "2026-03-10")).toBe("Yesterday");
    expect(formatDayLabel("2026-03-11", "2026-03-10")).toBe("Tomorrow");
    expect(formatDayLabel("2026-03-02", "2026-03-10")).toBe("Monday, March 2");
    expect(formatDayLabel("2025-12-25", "2026-03-10")).toBe("Thursday, December 25, 2025");
  });
  it("formats a long date", () => {
    expect(formatDayLong("2026-03-10")).toBe("Tuesday, March 10");
  });
});

describe("meals", () => {
  it("lists four meals and type-guards them", () => {
    expect(MEALS).toEqual(["breakfast", "lunch", "dinner", "snack"]);
    expect(isMeal("lunch")).toBe(true);
    expect(isMeal("brunch")).toBe(false);
  });
});

describe("resolveTargets", () => {
  const catalog: NutrientDef[] = [
    { key: "a", name: "Test A", unit: "g", category: "macro", dailyValue: 50 },
    { key: "b", name: "Test B", unit: "mg", category: "mineral", dailyValue: 100, direction: "limit", upperLimit: 300, upperLimitScope: "supplements" },
    { key: "c", name: "Test C", unit: "g", category: "other" },
  ];

  it("uses catalogue defaults when the user has set nothing", () => {
    const t = resolveTargets(catalog, {});
    expect(t.a).toEqual({ key: "a", direction: "goal", target: 50, upperLimit: null, upperLimitScope: "total", custom: false });
    expect(t.b).toMatchObject({ direction: "limit", target: 100, upperLimit: 300, upperLimitScope: "supplements", custom: false });
    expect(t.c).toMatchObject({ target: null, upperLimit: null });
  });

  it("lets a user override the target and upper limit, keeping direction and scope", () => {
    const t = resolveTargets(catalog, { b: { target: 80, upperLimit: 200 }, c: { target: 5, upperLimit: null } });
    expect(t.b).toMatchObject({ target: 80, upperLimit: 200, upperLimitScope: "supplements", direction: "limit", custom: true });
    expect(t.c).toMatchObject({ target: 5, custom: true });
  });

  it("keeps the catalogue upper limit when the user sets only a target", () => {
    expect(resolveTargets(catalog, { b: { target: 80, upperLimit: null } }).b!.upperLimit).toBe(300);
  });

  it("treats a target of 0 as no target", () => {
    expect(resolveTargets(catalog, { a: { target: 0, upperLimit: null } }).a!.target).toBeNull();
  });
});
