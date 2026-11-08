import { TriangleAlert } from "lucide-react";
import { formatAmount, formatPercent, formatQuantity, toneOf } from "@/lib/format";
import type { NutrientRow } from "@/lib/summary";
import { TONE } from "./styles";
import { Meter, StatusChip, UpperLimitChip } from "./ui";

/**
 * One nutrient: its name and status, a progress bar toward the target, the
 * amounts in words, how much came from supplements, and a warning if an upper
 * limit was passed.
 */
export function NutrientRowItem({ row }: { row: NutrientRow }) {
  const tone = TONE[toneOf(row.status)];
  const hasAmount = row.amount !== null;
  const targetText = row.target !== null ? ` of ${formatAmount(row.target, row.unit)}` : "";
  const amountText = hasAmount ? `${formatQuantity(row.amount!, row.unit)} ${row.unit}` : "–";
  const aria =
    row.percent !== null ? `${formatPercent(row.percent)} of ${row.direction === "limit" ? "limit" : "target"}` : "No target";

  return (
    <li className="border-b border-line py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate font-medium text-ink">{row.name}</span>
        {row.overUpperLimit ? <UpperLimitChip /> : <StatusChip status={row.status} direction={row.direction} />}
      </div>

      {row.percent !== null ? (
        <div className="mt-2">
          <Meter percent={row.percent} color={row.overUpperLimit ? "bg-over" : tone.bar} label={row.name} valueText={aria} />
        </div>
      ) : null}

      <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-sm text-muted">
        <span>
          <span className="font-semibold text-ink">{amountText}</span>
          {hasAmount ? targetText : null}
          {row.percent !== null ? ` · ${formatPercent(row.percent)}` : null}
        </span>
        {row.fromSupplements > 0 ? (
          <span>
            {formatAmount(row.fromSupplements, row.unit)} from supplements
          </span>
        ) : null}
      </div>

      {row.overUpperLimit && row.upperLimit !== null ? (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-over-soft p-2 text-sm text-over">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            Above the general adult upper limit of {formatAmount(row.upperLimit, row.unit)}
            {row.upperLimitScope === "supplements" ? " for supplements" : ""}.
          </span>
        </p>
      ) : null}
    </li>
  );
}

export function NutrientRowList({ rows }: { rows: NutrientRow[] }) {
  return <ul>{rows.map((r) => <NutrientRowItem key={r.key} row={r} />)}</ul>;
}
