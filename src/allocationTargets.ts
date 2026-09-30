// The user's personal FOUR-LAYER allocation target.
//
// WHAT THIS IS, and what it deliberately is not.
//
// It is a display preference: how much of the portfolio the user INTENDS to hold in each of
// four layers. It is stored exactly like the wealth goal in goal.ts and the reporting currency
// in reportingCurrency.ts, and for the same reasons — it is not portfolio data and nothing
// else needs to own it. localStorage keeps it across a page refresh and a normal browser
// restart, which is the whole durability requirement.
//
// It is NOT a classification engine. It owns no mapping from a holding to a layer: the layers
// below are addressed to the categories the snapshot already reports
// (Portfolio.category_allocation), and the actual percentage of each layer is that snapshot's
// own `actual_pct`, used unrounded and unrescaled. Nothing here reclassifies a holding,
// changes a classification rule, or recomputes a portfolio total.
//
// It is the ONLY target the dashboard displays. It drives both the four-layer card and the
// 个人组合配置 table's 目标配置 / 偏离 columns, through one piece of state (useAllocationTargets
// below, held by AllocationSection), so the two views can never show different targets.
//
// A snapshot's own CategoryAllocation.target_pct / gap_pct fields are left exactly as the
// source sends them (the demo sends null) and are not displayed.

import { useCallback, useState } from 'react';
import type { AllocationCategory, CategoryAllocation } from './types';
import { categoryLabel } from './labels';

/** The four layers, in the order they are displayed and in the order the bar segments them. */
export const ALLOCATION_LAYERS = ['core', 'mid', 'growth', 'cash'] as const;
export type AllocationLayer = (typeof ALLOCATION_LAYERS)[number];

/** A complete four-layer target. Every value is a nonnegative integer and the four sum to 100. */
export type AllocationTargets = Record<AllocationLayer, number>;

// Namespaced like the wealth-goal and reporting-currency keys, so it cannot collide with
// anything else on the same origin, and separate from them because it is edited independently.
export const TARGETS_STORAGE_KEY = 'folio.allocationTargets';

// A round product default. It only ever applies until the first save, and the tests use their
// own fabricated targets.
export const DEFAULT_TARGETS: AllocationTargets = { core: 50, mid: 20, growth: 15, cash: 15 };

// THE MAPPING, stated once and in one place.
//
// The four layers the user thinks in are not spelled the same as the categories the snapshot
// reports, so each one names its category EXPLICITLY rather than being matched by string
// similarity. Only 爆发层 differs in name: it is the existing 'High Beta' / 高弹性仓 category,
// which is the same concept under the dashboard's older vocabulary. No two categories are
// merged into one layer, and no layer covers more than one category.
//
// The snapshot's other categories — Bonds, Unclassified and Fund Assets — are NOT in this map
// and are not silently attributed to any layer. They are reported as a residual instead
// (see residualCategories below), so the four actuals can be read against the four targets
// while the part of the portfolio outside this model stays visible.
export const LAYER_CATEGORY: Readonly<Record<AllocationLayer, AllocationCategory>> = {
  core: 'Core',
  mid: 'Mid',
  growth: 'High Beta',
  cash: 'Cash',
};

/**
 * The layer a snapshot category belongs to — LAYER_CATEGORY read backwards — or null for a
 * category outside the four-layer model (Bonds, Unclassified, Fund Assets).
 */
export function categoryLayer(category: AllocationCategory): AllocationLayer | null {
  return ALLOCATION_LAYERS.find(layer => LAYER_CATEGORY[layer] === category) ?? null;
}

/**
 * A category's four-layer target percentage, or null when it has none. Null is not zero: a
 * category outside the model has no target at all, and must not read as a target of 0%.
 */
export function categoryTargetPct(
  targets: AllocationTargets, category: AllocationCategory,
): number | null {
  const layer = categoryLayer(category);
  return layer === null ? null : targets[layer];
}

/** The layer's own Chinese name, which is the target vocabulary rather than the category's. */
export const LAYER_LABEL: Readonly<Record<AllocationLayer, string>> = {
  core: '核心层', mid: '中仓层', growth: '爆发层', cash: '现金层',
};

/** The English layer name, shown beside the mapped category so the mapping is visible in the UI. */
export const LAYER_EN: Readonly<Record<AllocationLayer, string>> = {
  core: 'CORE', mid: 'MID', growth: 'GROWTH', cash: 'CASH',
};

/** The existing category label a layer reads its actual share from, shown in the card. */
export const layerCategoryLabel = (layer: AllocationLayer) => categoryLabel(LAYER_CATEGORY[layer]);

export const targetsSum = (targets: AllocationTargets) =>
  ALLOCATION_LAYERS.reduce((total, layer) => total + targets[layer], 0);

// How far a STORED sum may be from 100 and still be treated as a rounding artefact rather than
// a different allocation. Half a point: an editor that only ever writes integers summing to
// exactly 100 never needs it, but a hand-edited or older file might be off by a rounding step.
// Anything further out is not repaired into something plausible — it is refused.
const SUM_TOLERANCE = 0.5;

/**
 * Whether a value read back from storage is a usable four-layer target.
 *
 * Validated exactly as strictly as it is written, for the reason isWealthGoal() gives: a stored
 * target is hand-editable, can be stale and can come from a future build. A missing layer, a
 * non-numeric or non-finite value, a negative share, or a set that does not add up to a whole
 * portfolio is refused, and the caller falls back to the defaults.
 */
export function isAllocationTargets(value: unknown): value is AllocationTargets {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  for (const layer of ALLOCATION_LAYERS) {
    const share = record[layer];
    if (typeof share !== 'number' || !Number.isFinite(share) || share < 0) return false;
  }
  const sum = ALLOCATION_LAYERS.reduce((total, layer) => total + (record[layer] as number), 0);
  return Math.abs(sum - 100) <= SUM_TOLERANCE;
}

/**
 * The same targets as whole percentage points summing to exactly 100.
 *
 * The editor works in integers, so this is a no-op for anything it saved. It exists for a
 * stored value that passed validation while being a rounding step off — rounding each layer
 * and settling the remainder on the LARGEST layer, where one point is least significant.
 * It never invents a layer and never makes one negative.
 */
export function normalizeTargets(targets: AllocationTargets): AllocationTargets {
  const rounded = { ...targets };
  for (const layer of ALLOCATION_LAYERS) rounded[layer] = Math.max(0, Math.round(targets[layer]));
  const drift = 100 - targetsSum(rounded);
  if (drift === 0) return rounded;
  const largest = ALLOCATION_LAYERS.reduce(
    (best, layer) => (rounded[layer] > rounded[best] ? layer : best), ALLOCATION_LAYERS[0]);
  rounded[largest] = Math.max(0, rounded[largest] + drift);
  return rounded;
}

// Every localStorage access is wrapped, for the reason given in reportingCurrency.ts: in a
// private window, with site data blocked, or under a quota error the accessor itself throws,
// and a dashboard must never fail to render because a display preference could not be read.
export function readStoredTargets(): AllocationTargets | null {
  try {
    const raw = window.localStorage.getItem(TARGETS_STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isAllocationTargets(parsed) ? normalizeTargets(parsed) : null;
  } catch {
    // Unreadable storage and unparseable JSON are the same thing here: no configured target.
    return null;
  }
}

export function storeTargets(targets: AllocationTargets): void {
  try {
    window.localStorage.setItem(TARGETS_STORAGE_KEY, JSON.stringify(targets));
  } catch {
    /* Storage unavailable or blocked: the target still applies to this session. */
  }
}

/**
 * The persisted four-layer target as React state: the one source every target on the page reads.
 *
 * Held ONCE, by the component that renders every consumer (AllocationSection), and passed down.
 * Two independent reads of localStorage would each hold their own copy, and a save through one
 * would leave the other stale until a reload. `save` writes storage and state together, so every
 * consumer re-renders with the new target immediately.
 */
export function useAllocationTargets(): [AllocationTargets, (next: AllocationTargets) => void] {
  // null means "nothing configured yet": DEFAULT_TARGETS applies until the first save.
  const [stored, setStored] = useState<AllocationTargets | null>(() => readStoredTargets());
  const save = useCallback((next: AllocationTargets) => {
    setStored(next);
    storeTargets(next);
  }, []);
  return [stored ?? DEFAULT_TARGETS, save];
}

// ---- the segmented-bar drag model ----------------------------------------------------
//
// The bar is not four independent sliders. It is three BOUNDARIES on one 0–100 track, and the
// four layers are the gaps between them:
//
//   0 ──── b0 ──── b1 ──── b2 ──── 100
//     core     mid     growth   cash
//
// That is the whole reason the total cannot drift. Sum = b0 + (b1−b0) + (b2−b1) + (100−b2),
// which is 100 for ANY boundary positions — an algebraic identity, not something checked after
// the fact and corrected. Moving one boundary therefore changes exactly the two layers it
// separates and cannot touch the other two.

export type BoundaryIndex = 0 | 1 | 2;
/** One boundary per gap between adjacent layers: one fewer than the layers. */
export const BOUNDARY_INDEXES: readonly BoundaryIndex[] = [0, 1, 2];

/** The cumulative position of each boundary, in percent of the track. */
export function boundariesOf(targets: AllocationTargets): [number, number, number] {
  const core = targets.core;
  const mid = core + targets.mid;
  return [core, mid, mid + targets.growth];
}

/** The targets a set of boundary positions means. Sums to exactly 100 by construction. */
export function targetsFromBoundaries(
  bounds: readonly [number, number, number],
): AllocationTargets {
  return {
    core: bounds[0], mid: bounds[1] - bounds[0], growth: bounds[2] - bounds[1], cash: 100 - bounds[2],
  };
}

/** Which two layers a boundary separates — the only two any one drag can change. */
export const BOUNDARY_LAYERS: Readonly<Record<BoundaryIndex, [AllocationLayer, AllocationLayer]>> = {
  0: ['core', 'mid'], 1: ['mid', 'growth'], 2: ['growth', 'cash'],
};

/**
 * How far one boundary may travel: up to its neighbours, and no further.
 *
 * A boundary may reach its neighbour exactly, which collapses the layer between them to 0%.
 * That is allowed on purpose — a real allocation can hold nothing in a layer, and inventing a
 * minimum segment would make the bar refuse a target the user means. It may not pass its
 * neighbour, because that would make a layer negative.
 */
export function boundaryRange(
  targets: AllocationTargets, index: BoundaryIndex,
): [number, number] {
  const bounds = boundariesOf(targets);
  return [index === 0 ? 0 : bounds[index - 1], index === 2 ? 100 : bounds[index + 1]];
}

/**
 * The targets after dragging one boundary to `pct` along the track.
 *
 * `pct` is raw pointer arithmetic and may be off the track entirely (a drag that leaves the
 * card, a touch that lands past the edge); it is clamped to the boundary's range first and
 * rounded to a whole point after, so the result is always a valid integer allocation. The two
 * non-adjacent layers are copied through untouched.
 */
export function moveBoundary(
  targets: AllocationTargets, index: BoundaryIndex, pct: number,
): AllocationTargets {
  const [lower, upper] = boundaryRange(targets, index);
  // Clamped before rounding, and both bounds are already whole points, so the rounded result
  // cannot land outside the range.
  const next = Math.round(Math.min(upper, Math.max(lower, Number.isFinite(pct) ? pct : lower)));
  const bounds = boundariesOf(targets);
  bounds[index] = next;
  return targetsFromBoundaries(bounds);
}

/**
 * WHICH boundary a gesture that started at `index` should actually move, given where the
 * pointer is now.
 *
 * It matters because two boundaries can sit at the same place: collapsing a layer to 0% puts
 * its two boundaries on the same pixel, and only one of them can be on top. Without this, the
 * buried one is unreachable — the collapsed layer can be re-opened by dragging one way and not
 * the other, which reads as the bar being stuck.
 *
 * The rule is that the gesture belongs to whichever coincident boundary can actually move the
 * way the pointer is going. Dragging away from a pile of boundaries therefore always re-opens
 * the layer on the side the pointer is heading, from either handle, in either direction. It
 * walks the pile rather than stepping once, because more than two boundaries can coincide
 * (a 0% layer next to another 0% layer).
 */
export function resolveBoundary(
  targets: AllocationTargets, index: BoundaryIndex, pct: number,
): BoundaryIndex {
  const bounds = boundariesOf(targets);
  let resolved: number = index;
  // Only one of these can run: the pointer is either above the boundary or below it.
  while (pct > bounds[resolved] && resolved < 2 && bounds[resolved + 1] === bounds[resolved]) resolved += 1;
  while (pct < bounds[resolved] && resolved > 0 && bounds[resolved - 1] === bounds[resolved]) resolved -= 1;
  return resolved as BoundaryIndex;
}

/** Dragging by keyboard: the same move, stepped rather than pointed at. */
export function nudgeBoundary(
  targets: AllocationTargets, index: BoundaryIndex, step: number,
): AllocationTargets {
  return moveBoundary(targets, index, boundariesOf(targets)[index] + step);
}

// ---- reading the ACTUAL allocation off the snapshot -----------------------------------

/**
 * A layer's actual share of the portfolio, taken from the snapshot and nothing else.
 *
 * It is `CategoryAllocation.actual_pct` for the mapped category, unrounded and unrescaled. Null
 * — never a zero and never a guess — when the snapshot does not report that category, or
 * reports the percentage as unavailable: a layer whose share is unknown must not read as a
 * layer holding nothing.
 *
 * NOTE ON WHAT 100% MEANS HERE. These four actuals are shares of the WHOLE portfolio, so they
 * do not add up to 100 whenever the portfolio also holds bonds, fund assets or unclassified
 * positions. Rescaling them to sum to 100 would be a second accounting of the portfolio and is
 * not done; the shortfall is disclosed as a residual instead (residualCategories below).
 */
export function layerActualPct(
  allocation: readonly CategoryAllocation[] | undefined, layer: AllocationLayer,
): number | null {
  const entry = allocation?.find(item => item.category === LAYER_CATEGORY[layer]);
  const actual = entry?.actual_pct;
  return typeof actual === 'number' && Number.isFinite(actual) ? actual : null;
}

/** actual − target, in percentage points, or null when the actual is unavailable. */
export function layerGapPct(actual: number | null, target: number): number | null {
  return actual === null ? null : actual - target;
}

/**
 * The snapshot's categories that this four-layer model does not cover, with a share worth
 * mentioning: Bonds, Unclassified and Fund Assets, whenever the portfolio actually holds any.
 *
 * They are reported rather than absorbed. A zero-valued bucket is left out because it says
 * nothing (the snapshot pre-seeds every category), and an unavailable percentage is left out
 * because it is not a number to add up.
 */
export function residualCategories(
  allocation: readonly CategoryAllocation[] | undefined,
): { label: string; pct: number }[] {
  const covered = new Set<string>(Object.values(LAYER_CATEGORY));
  return (allocation ?? [])
    .filter(item => !covered.has(item.category) && typeof item.actual_pct === 'number'
      && Number.isFinite(item.actual_pct) && item.actual_pct !== 0)
    .map(item => ({ label: categoryLabel(item.category), pct: item.actual_pct as number }));
}
