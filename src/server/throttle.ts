/**
 * A sliding-window limiter: at most `limit` calls per `windowMs`. In-process,
 * which is enough to stop a double-tap or a runaway loop from hammering a free
 * public API on our behalf. `now` is injectable for tests.
 */
export function createThrottle(limit: number, windowMs: number, now: () => number = Date.now) {
  let hits: number[] = [];
  return function tryAcquire(): boolean {
    const t = now();
    hits = hits.filter((h) => t - h < windowMs);
    if (hits.length >= limit) return false;
    hits.push(t);
    return true;
  };
}
