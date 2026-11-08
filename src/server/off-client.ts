import { mapOffProduct, type OffResult } from "../lib/openfoodfacts";

export type OffLookup = OffResult | { ok: false; reason: "unavailable" | "rate_limited" };

const FIELDS = "code,product_name,generic_name,brands,serving_size,serving_quantity,nutriments";
const DEFAULT_USER_AGENT = "MacrosAndCalorie/0.1 (nutrition tracker; github.com/iwalumua/macrosandcalorie)";

/**
 * Look up one product by barcode on Open Food Facts. Never throws for expected
 * problems: a missing product, a rate limit and an outage all come back as a
 * reason the caller can explain. Open Food Facts asks apps to identify
 * themselves, so a User-Agent is always sent; override it with OFF_USER_AGENT.
 */
export async function fetchOffProduct(
  barcode: string,
  fetchImpl: typeof fetch = fetch,
  userAgent: string = process.env.OFF_USER_AGENT || DEFAULT_USER_AGENT,
): Promise<OffLookup> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: { "User-Agent": userAgent, Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (res.status === 429) return { ok: false, reason: "rate_limited" };
  if (res.status === 404) return { ok: false, reason: "not_found" };
  if (!res.ok) return { ok: false, reason: "unavailable" };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  return mapOffProduct(body);
}
