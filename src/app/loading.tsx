/** Shown while a screen loads: skeleton blocks in the same shapes as the real cards, so nothing jumps. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse space-y-4">
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-40 rounded-lg bg-surface-2" />
      <div className="h-16 rounded-2xl bg-surface-2" />
      <div className="h-72 rounded-2xl bg-surface-2" />
      <div className="h-28 rounded-2xl bg-surface-2" />
      <div className="h-28 rounded-2xl bg-surface-2" />
    </div>
  );
}
