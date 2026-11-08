import { formatKcal } from "@/lib/format";
import type { EnergySummary } from "@/lib/summary";

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Calories at a glance: a ring showing how much of today's budget is eaten,
 * with the figure that matters (calories left, or over) in the middle and the
 * arithmetic underneath: goal - food + exercise = left.
 */
export function CalorieRing({ energy }: { energy: EnergySummary }) {
  const { goal, eaten, burned, budget, remaining } = energy;
  const fraction = budget && budget > 0 ? Math.min(1, Math.max(0, eaten / budget)) : 0;
  const over = remaining !== null && remaining < 0;
  const centerValue = remaining === null ? eaten : Math.abs(remaining);
  const centerLabel = remaining === null ? "kcal eaten" : over ? "kcal over" : "kcal left";
  const summary =
    remaining === null
      ? `${formatKcal(eaten)} calories eaten. No calorie goal set.`
      : `${formatKcal(eaten)} of ${formatKcal(budget ?? 0)} calories eaten. ${formatKcal(Math.abs(remaining))} ${over ? "over" : "left"}.`;

  return (
    <div>
      <div className="relative mx-auto size-44">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90" role="img" aria-label={summary}>
          <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="var(--line)" strokeWidth="10" />
          <circle
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            stroke={over ? "var(--over)" : "var(--primary)"}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${CIRCUMFERENCE * fraction} ${CIRCUMFERENCE}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-4xl font-bold tracking-tight ${over ? "text-over" : "text-ink"}`}>
            {formatKcal(centerValue)}
          </span>
          <span className="text-sm text-muted">{centerLabel}</span>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-4 gap-1 text-center">
        <Figure label="Goal" value={goal === null ? "–" : formatKcal(goal)} />
        <Figure label="Food" value={formatKcal(eaten)} sign="−" />
        <Figure label="Exercise" value={formatKcal(burned)} sign="+" />
        <Figure label={over ? "Over" : "Left"} value={remaining === null ? "–" : formatKcal(Math.abs(remaining))} sign="=" strong />
      </dl>
    </div>
  );
}

function Figure({ label, value, sign, strong }: { label: string; value: string; sign?: string; strong?: boolean }) {
  return (
    <div>
      <dd className={`text-lg ${strong ? "font-bold text-ink" : "font-semibold text-ink"}`}>
        {sign ? (
          <span aria-hidden className="mr-0.5 text-muted">
            {sign}
          </span>
        ) : null}
        {value}
      </dd>
      <dt className="text-xs text-muted">{label}</dt>
    </div>
  );
}
