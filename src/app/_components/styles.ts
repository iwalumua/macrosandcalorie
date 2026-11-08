import type { Tone } from "@/lib/format";

/*
 * Shared class names. Tailwind only generates classes it can see as complete
 * strings, so tone variants are spelled out here rather than built dynamically.
 * Every interactive control is at least 48px tall (Android's touch target size).
 */

export const card = "rounded-2xl border border-line bg-surface p-4";

const buttonBase =
  "inline-flex min-h-12 select-none items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold transition-opacity active:opacity-80 disabled:cursor-not-allowed disabled:opacity-50";

export const btnPrimary = `${buttonBase} bg-primary text-on-primary`;
export const btnSecondary = `${buttonBase} border border-line bg-surface text-ink`;
export const btnDanger = `${buttonBase} border border-line bg-surface text-over`;
export const btnGhost = `${buttonBase} px-3 text-primary`;
/** A square icon-only button with a 48px hit area. */
export const btnIcon =
  "inline-flex size-12 shrink-0 items-center justify-center rounded-xl text-muted transition-colors active:bg-surface-2";

export const input =
  "min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-base text-ink placeholder:text-muted";

export const label = "mb-1 block text-sm font-medium text-ink";
export const hint = "mt-1 text-sm text-muted";

export const TONE: Record<Tone, { text: string; soft: string; bar: string }> = {
  good: { text: "text-good", soft: "bg-good-soft", bar: "bg-good" },
  near: { text: "text-near", soft: "bg-near-soft", bar: "bg-near" },
  low: { text: "text-low", soft: "bg-low-soft", bar: "bg-low" },
  over: { text: "text-over", soft: "bg-over-soft", bar: "bg-over" },
  muted: { text: "text-muted", soft: "bg-surface-2", bar: "bg-muted" },
};
