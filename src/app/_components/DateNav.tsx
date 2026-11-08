import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { addDays, formatDayLabel, formatDayLong } from "@/lib/dates";
import { DateJump } from "./DateJump";

/** Previous day, the current day (tap to pick any date), next day. */
export function DateNav({
  date,
  today,
  basePath,
}: {
  date: string;
  today: string;
  basePath: string;
}) {
  const label = formatDayLabel(date, today);
  const long = formatDayLong(date, { year: date.slice(0, 4) !== today.slice(0, 4) });
  const arrow = "flex size-12 shrink-0 items-center justify-center rounded-xl text-ink active:bg-surface-2";
  return (
    <nav aria-label="Change day" className="mb-4 flex items-center gap-1 rounded-2xl border border-line bg-surface p-1">
      <Link href={`${basePath}?date=${addDays(date, -1)}`} aria-label="Previous day" className={arrow}>
        <ChevronLeft aria-hidden className="size-6" />
      </Link>
      <DateJump value={date} basePath={basePath} label={label} sublabel={label === long ? undefined : long} />
      <Link href={`${basePath}?date=${addDays(date, 1)}`} aria-label="Next day" className={arrow}>
        <ChevronRight aria-hidden className="size-6" />
      </Link>
    </nav>
  );
}
