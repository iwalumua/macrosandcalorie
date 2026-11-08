import { describe, expect, it } from "vitest";
import {
  formatAmount,
  formatKcal,
  formatMinutes,
  formatNumber,
  formatPercent,
  formatQuantity,
  statusLabel,
  toneOf,
} from "../src/lib/format";

describe("number formatting", () => {
  it("groups thousands and limits decimals", () => {
    expect(formatNumber(1234.567)).toBe("1,234.6");
    expect(formatNumber(2000, 0)).toBe("2,000");
    expect(formatKcal(1234.5)).toBe("1,235");
    expect(formatKcal(0)).toBe("0");
  });

  it("never prints negative zero", () => {
    expect(formatNumber(-0)).toBe("0");
    expect(formatKcal(-0.2)).toBe("0");
  });

  it("chooses decimals by size and unit", () => {
    expect(formatQuantity(1234.5, "mg")).toBe("1,235");
    expect(formatQuantity(123.4, "g")).toBe("123");
    expect(formatQuantity(12.34, "g")).toBe("12.3");
    expect(formatQuantity(1.26, "mg")).toBe("1.3");
    expect(formatQuantity(0.045, "mg")).toBe("0.05");
    expect(formatQuantity(0, "g")).toBe("0");
    expect(formatQuantity(12.7, "kcal")).toBe("13");
  });

  it("appends the unit", () => {
    expect(formatAmount(12.34, "g")).toBe("12.3 g");
    expect(formatAmount(850, "kcal")).toBe("850 kcal");
  });

  it("formats percentages and durations", () => {
    expect(formatPercent(72.6)).toBe("73%");
    expect(formatPercent(1234)).toBe("1,234%");
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(60)).toBe("1 h");
    expect(formatMinutes(90)).toBe("1 h 30 min");
    expect(formatMinutes(0)).toBe("0 min");
  });
});

describe("status wording", () => {
  it("reads naturally for goals, limits and budgets", () => {
    expect(statusLabel("good", "goal")).toBe("Met");
    expect(statusLabel("near", "goal")).toBe("Almost");
    expect(statusLabel("low", "goal")).toBe("Low");
    expect(statusLabel("good", "limit")).toBe("Within limit");
    expect(statusLabel("near", "limit")).toBe("Near limit");
    expect(statusLabel("over", "limit")).toBe("Over limit");
    expect(statusLabel("good", "budget")).toBe("On target");
    expect(statusLabel("low", "budget")).toBe("Under");
    expect(statusLabel("over", "budget")).toBe("Over");
    expect(statusLabel("no_data", "goal")).toBe("No data");
    expect(statusLabel("no_target", "goal")).toBe("No target");
  });

  it("maps statuses to tones, with unknowns muted", () => {
    expect(toneOf("good")).toBe("good");
    expect(toneOf("over")).toBe("over");
    expect(toneOf("no_data")).toBe("muted");
    expect(toneOf("no_target")).toBe("muted");
  });
});
