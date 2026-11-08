import { ArrowDown, ArrowUp, Check, ChevronLeft, Equal, Minus, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { NutrientDirection } from "@/db/nutrient-catalog";
import { statusLabel, toneOf } from "@/lib/format";
import type { NutrientStatus } from "@/lib/summary";
import { TONE, card } from "./styles";

const STATUS_ICON = {
  good: Check,
  near: Equal,
  low: ArrowDown,
  over: ArrowUp,
  no_data: Minus,
  no_target: Minus,
} as const;

/** A status as an icon and a word, so it never depends on colour alone. */
export function StatusChip({
  status,
  direction = "goal",
}: {
  status: NutrientStatus;
  direction?: NutrientDirection;
}) {
  const tone = TONE[toneOf(status)];
  const Icon = STATUS_ICON[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tone.soft} ${tone.text}`}
    >
      <Icon aria-hidden className="size-3.5" strokeWidth={3} />
      {statusLabel(status, direction)}
    </span>
  );
}

/** A red "over the upper limit" flag, shown instead of the target status when a limit is exceeded. */
export function UpperLimitChip() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-over-soft px-2.5 py-1 text-xs font-semibold text-over">
      <TriangleAlert aria-hidden className="size-3.5" strokeWidth={3} />
      Over limit
    </span>
  );
}

/** A horizontal progress bar. `valueText` is what a screen reader hears. */
export function Meter({
  percent,
  color,
  label,
  valueText,
  height = "h-2",
}: {
  percent: number | null;
  /** A complete Tailwind background class, e.g. "bg-protein". */
  color: string;
  label: string;
  valueText: string;
  height?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent ?? 0));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-valuetext={valueText}
      className={`${height} w-full overflow-hidden rounded-full bg-surface-2`}
    >
      <div className={`h-full rounded-full ${color}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function Card({
  children,
  className = "",
  as: Tag = "section",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={`${card} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex min-h-8 items-center justify-between gap-2">
      <h2 className="text-base font-semibold text-ink">{children}</h2>
      {action}
    </div>
  );
}

/** Page heading with an optional back link and trailing action. */
export function PageHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: string;
  subtitle?: string;
  back?: { href: string; label: string };
  action?: ReactNode;
}) {
  return (
    <header className="mb-4">
      {back ? (
        <Link
          href={back.href}
          className="-ml-2 mb-1 inline-flex min-h-12 items-center gap-1 rounded-xl px-2 text-sm font-medium text-primary"
        >
          <ChevronLeft aria-hidden className="size-5" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
        </div>
        {action}
      </div>
    </header>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line p-6 text-center">
      <p className="font-semibold text-ink">{title}</p>
      {children ? <div className="mt-1 text-sm text-muted">{children}</div> : null}
    </div>
  );
}
