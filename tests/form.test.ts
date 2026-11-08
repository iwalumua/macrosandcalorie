import { describe, expect, it } from "vitest";
import { InputError } from "../src/lib/errors";
import {
  dateField,
  idField,
  mealField,
  optionalIdField,
  optionalNumber,
  requiredNumber,
  safeReturnPath,
  text,
  toFormState,
} from "../src/server/form";
import { nutrientField, readNutrientFields } from "../src/server/nutrient-fields";

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

describe("optionalNumber", () => {
  it("returns undefined for blank, never 0", () => {
    expect(optionalNumber(form({}), "x")).toBeUndefined();
    expect(optionalNumber(form({ x: "" }), "x")).toBeUndefined();
    expect(optionalNumber(form({ x: "   " }), "x")).toBeUndefined();
  });

  it("parses plain, decimal, decimal-comma and padded numbers", () => {
    expect(optionalNumber(form({ x: "12" }), "x")).toBe(12);
    expect(optionalNumber(form({ x: "12.5" }), "x")).toBe(12.5);
    expect(optionalNumber(form({ x: "1,5" }), "x")).toBe(1.5);
    expect(optionalNumber(form({ x: " 7 " }), "x")).toBe(7);
    expect(optionalNumber(form({ x: ".5" }), "x")).toBe(0.5);
    expect(optionalNumber(form({ x: "0" }), "x")).toBe(0);
  });

  it.each(["abc", "1e5", "1.2.3", "1,234.5", "Infinity", "NaN", "--1", "0x10", "12px"])(
    "rejects %s with a readable message",
    (bad) => {
      expect(() => optionalNumber(form({ x: bad }), "x", "Protein")).toThrow(InputError);
      expect(() => optionalNumber(form({ x: bad }), "x", "Protein")).toThrow(/Protein must be a number/);
    },
  );

  it("requiredNumber insists on a value", () => {
    expect(() => requiredNumber(form({}), "x", "Amount")).toThrow(/Amount is required/);
    expect(requiredNumber(form({ x: "3" }), "x")).toBe(3);
  });
});

describe("field parsers", () => {
  it("validates dates and meals", () => {
    expect(dateField(form({ date: "2026-03-10" }))).toBe("2026-03-10");
    expect(() => dateField(form({ date: "2026-02-30" }))).toThrow(InputError);
    expect(() => dateField(form({}))).toThrow(InputError);
    expect(mealField(form({ meal: "lunch" }))).toBe("lunch");
    expect(() => mealField(form({ meal: "brunch" }))).toThrow(InputError);
  });

  it("validates ids", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    expect(idField(form({ id }), "id")).toBe(id);
    expect(() => idField(form({ id: "1; drop table users" }), "id")).toThrow(InputError);
    expect(optionalIdField(form({}), "id")).toBeNull();
    expect(optionalIdField(form({ id }), "id")).toBe(id);
  });

  it("trims text and ignores file uploads", () => {
    expect(text(form({ a: "  hi " }), "a")).toBe("hi");
    expect(text(form({}), "a")).toBe("");
    const fd = new FormData();
    fd.set("a", new File(["x"], "x.txt"));
    expect(text(fd, "a")).toBe("");
  });
});

describe("safeReturnPath", () => {
  it("allows in-app paths only", () => {
    expect(safeReturnPath("/summary?date=2026-03-10", "/diary")).toBe("/summary?date=2026-03-10");
    for (const evil of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", ""]) {
      expect(safeReturnPath(evil, "/diary")).toBe("/diary");
    }
  });
});

describe("toFormState", () => {
  it("shows input errors and hides everything else", () => {
    expect(toFormState(new InputError("Name is required."))).toEqual({ error: "Name is required." });
    const quiet = console.error;
    console.error = () => {};
    try {
      expect(toFormState(new Error("password=hunter2 at db.internal:5432"))).toEqual({
        error: "Something went wrong. Please try again.",
      });
    } finally {
      console.error = quiet;
    }
  });
});

describe("readNutrientFields", () => {
  it("returns only the nutrients that were filled in", () => {
    const got = readNutrientFields(
      form({ [nutrientField("protein")]: "10", [nutrientField("vit_c")]: "", [nutrientField("fat")]: "0" }),
    );
    expect(got).toEqual({ protein: 10, fat: 0 }); // an explicit 0 is kept, a blank is not
  });

  it("reports which nutrient has a bad value", () => {
    expect(() => readNutrientFields(form({ [nutrientField("sodium")]: "lots" }))).toThrow(/Sodium must be a number/);
  });
});
