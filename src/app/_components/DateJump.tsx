"use client";

import { CalendarDays } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * The centre of the date bar. Tapping it opens the phone's own date picker, an
 * invisible native input laid over the label, so there is no custom calendar to
 * build or get wrong.
 */
export function DateJump({
  value,
  basePath,
  label,
  sublabel,
}: {
  value: string;
  basePath: string;
  label: string;
  sublabel?: string;
}) {
  const router = useRouter();
  return (
    <label className="relative flex min-h-12 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center rounded-xl px-2 active:bg-surface-2">
      <span className="flex items-center gap-1.5 text-base font-semibold text-ink">
        <CalendarDays aria-hidden className="size-4 text-muted" />
        {label}
      </span>
      {sublabel ? <span className="text-xs text-muted">{sublabel}</span> : null}
      <input
        type="date"
        value={value}
        aria-label="Choose a date"
        onClick={(e) => {
          try {
            e.currentTarget.showPicker();
          } catch {
            /* browsers without showPicker still open the picker on tap */
          }
        }}
        onChange={(e) => {
          if (e.target.value) router.push(`${basePath}?date=${e.target.value}`);
        }}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
    </label>
  );
}
