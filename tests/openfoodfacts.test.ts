import { describe, expect, it } from "vitest";
import { describeOffFailure, hasValidCheckDigit, isBarcode, mapOffProduct } from "../src/lib/openfoodfacts";
import { fetchOffProduct } from "../src/server/off-client";
import { createThrottle } from "../src/server/throttle";

/*
 * Synthetic products shaped like Open Food Facts responses: invented names and
 * round numbers, not real nutrition data. 12345670 is a valid EAN-8.
 */
const product = (over: Record<string, unknown> = {}, nutriments: Record<string, unknown> = {}) => ({
  status: 1,
  product: {
    code: "12345670",
    product_name: "Test Cocoa Spread",
    brands: "Test Brand, Test Parent",
    serving_size: "15 g",
    serving_quantity: 15,
    nutriments: {
      "energy-kcal_100g": 500,
      proteins_100g: 5,
      carbohydrates_100g: 50,
      fat_100g: 30,
      ...nutriments,
    },
    ...over,
  },
});
const map = (over?: Record<string, unknown>, nutriments?: Record<string, unknown>) => mapOffProduct(product(over, nutriments));
const food = (r: ReturnType<typeof mapOffProduct>) => {
  if (!r.ok) throw new Error(`expected a food, got ${r.reason}`);
  return r.food;
};

describe("barcodes", () => {
  it("accepts 8 to 14 digits only", () => {
    for (const ok of ["12345670", "123456789012", "1234567890123", "12345678901234"]) expect(isBarcode(ok)).toBe(true);
    for (const bad of ["1234567", "123456789012345", "1234-5670", "abc12345", "", " 12345670"]) expect(isBarcode(bad)).toBe(false);
  });

  it("checks the GS1 check digit (EAN-8, UPC-A and EAN-13)", () => {
    expect(hasValidCheckDigit("12345670")).toBe(true); // EAN-8
    expect(hasValidCheckDigit("96385074")).toBe(true); // EAN-8
    expect(hasValidCheckDigit("036000291452")).toBe(true); // UPC-A
    expect(hasValidCheckDigit("4006381333931")).toBe(true); // EAN-13
    expect(hasValidCheckDigit("3017620422003")).toBe(true); // EAN-13
    expect(hasValidCheckDigit("12345671")).toBe(false); // one digit off
    expect(hasValidCheckDigit("4006381333932")).toBe(false);
    expect(hasValidCheckDigit("not a code")).toBe(false);
  });
});

describe("mapOffProduct: the happy path", () => {
  it("maps the product, keeping grams for macros", () => {
    const f = food(map());
    expect(f).toMatchObject({ source: "off", sourceId: "12345670", barcode: "12345670", name: "Test Cocoa Spread", brand: "Test Brand, Test Parent" });
    expect(f.per100g).toEqual({ energy_kcal: 500, protein: 5, carbs: 50, fat: 30 });
    expect(f.servings).toEqual([{ label: "15 g", grams: 15 }]);
  });

  it("converts grams to each nutrient's own unit", () => {
    const f = food(
      map({}, {
        "vitamin-c_100g": 0.05, // g -> 50 mg
        "vitamin-d_100g": 0.00001, // g -> 10 mcg
        calcium_100g: 0.12, // g -> 120 mg
        "vitamin-b12_100g": 0.000003, // g -> 3 mcg
        fiber_100g: 3.5, // stays grams
        cholesterol_100g: 0.02, // g -> 20 mg
      }),
    );
    expect(f.per100g.vit_c).toBeCloseTo(50);
    expect(f.per100g.vit_d).toBeCloseTo(10);
    expect(f.per100g.calcium).toBeCloseTo(120);
    expect(f.per100g.vit_b12).toBeCloseTo(3);
    expect(f.per100g.fiber).toBe(3.5);
    expect(f.per100g.cholesterol).toBeCloseTo(20);
  });

  it("accepts numeric strings, which the API sometimes sends", () => {
    const f = food(map({}, { proteins_100g: "7.5", "energy-kcal_100g": "480" }));
    expect(f.per100g.protein).toBe(7.5);
    expect(f.per100g.energy_kcal).toBe(480);
  });

  it("cleans the name and brand", () => {
    const f = food(map({ product_name: "  Test   Spread \n Deluxe ", brands: "  Test Brand " }));
    expect(f.name).toBe("Test Spread Deluxe");
    expect(f.brand).toBe("Test Brand");
    expect(food(map({ product_name: "x".repeat(500) })).name.length).toBe(200);
    expect(food(map({ brands: "" })).brand).toBeNull();
  });

  it("falls back to the generic name when there is no product name", () => {
    expect(food(map({ product_name: "", generic_name: "Test Generic Spread" })).name).toBe("Test Generic Spread");
  });
});

describe("mapOffProduct: energy and sodium fallbacks", () => {
  it("converts kJ to kcal when kcal is missing", () => {
    const f = food(map({}, { "energy-kcal_100g": undefined, "energy-kj_100g": 2092 }));
    expect(f.per100g.energy_kcal).toBeCloseTo(500, 0);
    const g = food(map({}, { "energy-kcal_100g": undefined, energy_100g: 2092 }));
    expect(g.per100g.energy_kcal).toBeCloseTo(500, 0);
  });

  it("estimates energy from macros when no energy value exists", () => {
    const f = food(map({}, { "energy-kcal_100g": undefined }));
    expect(f.per100g.energy_kcal).toBe(5 * 4 + 50 * 4 + 30 * 9);
  });

  it("uses sodium when given, otherwise derives it from salt (salt = sodium x 2.5)", () => {
    expect(food(map({}, { sodium_100g: 0.4 })).per100g.sodium).toBeCloseTo(400);
    expect(food(map({}, { salt_100g: 1 })).per100g.sodium).toBeCloseTo(400);
    expect(food(map({}, { sodium_100g: 0.4, salt_100g: 5 })).per100g.sodium).toBeCloseTo(400); // sodium wins
  });
});

describe("mapOffProduct: crowd-sourced data is treated with suspicion", () => {
  it("skips a nutrient declared in a non-mass unit", () => {
    const f = food(map({}, { "vitamin-c_100g": 0.05, "vitamin-c_unit": "IU", "calcium_100g": 0.1, calcium_unit: "%" }));
    expect(f.per100g.vit_c).toBeUndefined();
    expect(f.per100g.calcium).toBeUndefined();
  });

  it("does not import vitamin A, folate or alcohol, whose definitions or units do not match the catalogue", () => {
    const f = food(map({}, { "vitamin-a_100g": 0.001, "vitamin-b9_100g": 0.0001, alcohol_100g: 5, "alcohol_unit": "% vol" }));
    expect(Object.keys(f.per100g).sort()).toEqual(["carbs", "energy_kcal", "fat", "protein"]);
  });

  it("drops impossible values instead of storing them", () => {
    const f = food(map({}, { fiber_100g: 5000, "vitamin-c_100g": 250, "energy-kcal_100g": 5000 }));
    expect(f.per100g.fiber).toBeUndefined(); // 5000 g in 100 g
    expect(f.per100g.vit_c).toBeUndefined();
    expect(f.per100g.energy_kcal).toBe(5 * 4 + 50 * 4 + 30 * 9); // implausible energy replaced by the macro estimate
  });

  it("ignores negative and non-numeric values", () => {
    const f = food(map({}, { fiber_100g: -3, sugars_100g: "lots", "added-sugars_100g": null }));
    expect(f.per100g).toEqual({ energy_kcal: 500, protein: 5, carbs: 50, fat: 30 });
  });

  it("refuses a product whose macros add up to more than 100 g per 100 g", () => {
    expect(map({}, { proteins_100g: 60, carbohydrates_100g: 60, fat_100g: 10 })).toEqual({ ok: false, reason: "inconsistent" });
  });

  it("accepts macros adding up to just over 100 g (rounding on labels)", () => {
    expect(map({}, { proteins_100g: 30, carbohydrates_100g: 40, fat_100g: 33 }).ok).toBe(true);
  });

  it("refuses a product with no usable nutrition", () => {
    expect(mapOffProduct({ status: 1, product: { code: "12345670", product_name: "Test", nutriments: {} } })).toEqual({ ok: false, reason: "no_nutrition" });
    expect(mapOffProduct({ status: 1, product: { code: "12345670", product_name: "Test" } })).toEqual({ ok: false, reason: "no_nutrition" });
  });

  it("refuses a product with no name", () => {
    expect(map({ product_name: "", generic_name: "" })).toEqual({ ok: false, reason: "no_name" });
  });

  it("treats missing products and garbage as not found, never as a crash", () => {
    for (const junk of [null, undefined, 42, "text", [], {}, { status: 0 }, { status: 0, status_verbose: "product not found" }, { status: 1 }, { status: 1, product: null }, { status: 1, product: { code: "abc", product_name: "x" } }]) {
      expect(mapOffProduct(junk)).toEqual({ ok: false, reason: "not_found" });
    }
  });

  it("only keeps a serving with a sensible weight and a label", () => {
    expect(food(map({ serving_quantity: 0 })).servings).toEqual([]);
    expect(food(map({ serving_quantity: 99999 })).servings).toEqual([]);
    expect(food(map({ serving_size: "" })).servings).toEqual([]);
    expect(food(map({ serving_quantity: "30", serving_size: "30 g" })).servings).toEqual([{ label: "30 g", grams: 30 }]);
    expect(food(map({ serving_quantity: undefined, serving_size: undefined })).servings).toEqual([]);
  });
});

describe("describeOffFailure", () => {
  it("hints at a typo only when the check digit is wrong", () => {
    expect(describeOffFailure("not_found", "12345670")).not.toMatch(/typo/);
    expect(describeOffFailure("not_found", "12345671")).toMatch(/typo/);
    expect(describeOffFailure("not_found", "12345670")).toMatch(/add it yourself/);
  });
  it("has a message for every reason", () => {
    for (const r of ["not_found", "no_name", "no_nutrition", "inconsistent", "rate_limited", "unavailable"] as const) {
      expect(describeOffFailure(r, "12345670").length).toBeGreaterThan(20);
    }
  });
});

describe("fetchOffProduct", () => {
  const respond = (status: number, body: unknown) => async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

  it("returns the mapped food and identifies the app", async () => {
    let seen: { url: string; ua: string | null } | null = null;
    const r = await fetchOffProduct("12345670", (async (url: string, init: RequestInit) => {
      seen = { url, ua: new Headers(init.headers).get("user-agent") };
      return new Response(JSON.stringify(product()), { status: 200 });
    }) as unknown as typeof fetch);
    expect(r.ok && r.food.name).toBe("Test Cocoa Spread");
    expect(seen!.url).toContain("/api/v2/product/12345670.json");
    expect(seen!.ua).toMatch(/^MacrosAndCalorie\//);
  });

  it("lets the User-Agent be overridden", async () => {
    let ua: string | null = null;
    await fetchOffProduct("12345670", (async (_u: string, init: RequestInit) => {
      ua = new Headers(init.headers).get("user-agent");
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch, "MyApp/9");
    expect(ua).toBe("MyApp/9");
  });

  it("maps HTTP outcomes to reasons the caller can explain", async () => {
    const call = (f: typeof fetch) => fetchOffProduct("12345670", f);
    expect(await call(respond(404, { status: 0 }) as unknown as typeof fetch)).toEqual({ ok: false, reason: "not_found" });
    expect(await call(respond(200, { status: 0, status_verbose: "product not found" }) as unknown as typeof fetch)).toEqual({ ok: false, reason: "not_found" });
    expect(await call(respond(429, "slow down") as unknown as typeof fetch)).toEqual({ ok: false, reason: "rate_limited" });
    expect(await call(respond(503, "down") as unknown as typeof fetch)).toEqual({ ok: false, reason: "unavailable" });
    expect(await call(respond(200, "<html>not json</html>") as unknown as typeof fetch)).toEqual({ ok: false, reason: "unavailable" });
    expect(await call((async () => { throw new TypeError("network down"); }) as unknown as typeof fetch)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("never lets a hostile barcode change the request path", async () => {
    let url = "";
    await fetchOffProduct("../../etc/passwd?x=1", (async (u: string) => { url = u; return new Response("{}", { status: 404 }); }) as unknown as typeof fetch);
    expect(url).not.toContain("../");
    expect(url).toContain("..%2F..%2Fetc%2Fpasswd%3Fx%3D1.json");
  });
});

describe("createThrottle", () => {
  it("allows `limit` calls per window, then recovers as the window slides", () => {
    let t = 0;
    const take = createThrottle(3, 1000, () => t);
    expect([take(), take(), take(), take()]).toEqual([true, true, true, false]);
    t = 999;
    expect(take()).toBe(false);
    t = 1000;
    expect(take()).toBe(true);
  });
});
