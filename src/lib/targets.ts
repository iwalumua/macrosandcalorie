import type {
  NutrientDef,
  NutrientDirection,
  UpperLimitScope,
} from "../db/nutrient-catalog";

/** A target the user has set, overriding the generic default for one nutrient. */
export interface TargetOverride {
  target: number;
  upperLimit: number | null;
}

export interface ResolvedTarget {
  key: string;
  direction: NutrientDirection;
  /** The daily target, or null when this nutrient has no target. */
  target: number | null;
  upperLimit: number | null;
  upperLimitScope: UpperLimitScope;
  /** True when the user set the target, false when it is the generic default. */
  custom: boolean;
}

/**
 * Combine the catalogue's generic reference values with the user's own targets.
 * A user target replaces the default Daily Value; a user upper limit replaces
 * the catalogue's. A target of 0 means "no target".
 */
export function resolveTargets(
  catalog: readonly NutrientDef[],
  overrides: Readonly<Record<string, TargetOverride>>,
): Record<string, ResolvedTarget> {
  const out: Record<string, ResolvedTarget> = {};
  for (const n of catalog) {
    const o = overrides[n.key];
    const target = o ? o.target : (n.dailyValue ?? null);
    out[n.key] = {
      key: n.key,
      direction: n.direction ?? "goal",
      target: target != null && target > 0 ? target : null,
      upperLimit: o?.upperLimit ?? n.upperLimit ?? null,
      upperLimitScope: n.upperLimitScope ?? "total",
      custom: o != null,
    };
  }
  return out;
}
