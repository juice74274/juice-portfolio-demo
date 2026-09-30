// The user's personal wealth goal.
//
// This is a PERSONAL UI PREFERENCE, exactly like the reporting currency in
// reportingCurrency.ts, and it is stored the same way and for the same reasons: it is not
// portfolio data and nothing else needs to own it. localStorage keeps it across a page refresh
// and a normal browser restart, which is the whole durability requirement.
//
// CURRENCY SEMANTICS. A goal is denominated in a currency, and this file deliberately reuses
// REPORTING_CURRENCIES rather than declaring a second list: the goal currency is one the
// source can value the portfolio in, so the progress can be read off a snapshot valued in that
// currency. The goal currency is NOT the dashboard's reporting currency — the two are
// independent settings, and neither ever changes the other. When they differ, the card asks
// the source for a cached-only revaluation in the goal currency (see GoalCard.tsx). There is
// no FX arithmetic anywhere in this file: converting a total here would be a second FX engine,
// and the source already owns the only one (in the demo, demo/mockFx.ts).

import { REPORTING_CURRENCIES, type ReportingCurrency } from './reportingCurrency';

export type WealthGoal = {
  /** The target amount, denominated in `currency`. Always finite and strictly positive. */
  target: number;
  /** The currency the target is expressed in — one of the dashboard's reporting currencies. */
  currency: ReportingCurrency;
};

// Namespaced like the reporting-currency key, so it cannot collide with anything else on the
// same origin, and separate from it because the two settings are edited independently.
export const GOAL_STORAGE_KEY = 'folio.wealthGoal';

// A round product default, used only when the source states no default of its own (the demo
// states USD 1,000,000). It only ever applies until the first save.
export const DEFAULT_TARGET = 1_000_000;
export const DEFAULT_CURRENCY: ReportingCurrency = 'CNH';

/**
 * The goal to show when nothing has been configured yet.
 *
 * It takes its currency from the snapshot ON SCREEN when that currency is selectable, so a
 * fresh dashboard never opens on a goal denominated in a currency it is not reporting in —
 * there is nothing to reconcile before the first edit. An unknown or non-selectable base
 * (no snapshot yet, or a base outside the list) falls back to the default above.
 */
export function defaultGoal(displayCurrency: string | null): WealthGoal {
  return {
    target: DEFAULT_TARGET,
    currency: (REPORTING_CURRENCIES as readonly string[]).includes(displayCurrency ?? '')
      ? (displayCurrency as ReportingCurrency) : DEFAULT_CURRENCY,
  };
}

/**
 * Whether a value read back from storage is a usable goal.
 *
 * A stored goal is hand-editable, can be stale, and can come from a future build, so it is
 * validated exactly as strictly as it is written: a non-positive, non-finite or non-numeric
 * target, or a currency outside the allowlist, is not repaired into something plausible. It
 * is refused, and the caller falls back to the default — which is the same rule
 * readStoredReportingCurrency() applies, for the same reason. A target of 0 in particular
 * must never reach the progress calculation.
 */
export function isWealthGoal(value: unknown): value is WealthGoal {
  if (typeof value !== 'object' || value === null) return false;
  const { target, currency } = value as Record<string, unknown>;
  return typeof target === 'number' && Number.isFinite(target) && target > 0
    && typeof currency === 'string' && (REPORTING_CURRENCIES as readonly string[]).includes(currency);
}

// Every localStorage access is wrapped, for the reason given in reportingCurrency.ts: in a
// private window, with site data blocked, or under a quota error the accessor itself throws,
// and a dashboard must never fail to render because a display preference could not be read.
export function readStoredGoal(): WealthGoal | null {
  try {
    const raw = window.localStorage.getItem(GOAL_STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isWealthGoal(parsed) ? parsed : null;
  } catch {
    // Unreadable storage and unparseable JSON are the same thing here: no configured goal.
    return null;
  }
}

export function storeGoal(goal: WealthGoal): void {
  try {
    window.localStorage.setItem(GOAL_STORAGE_KEY, JSON.stringify(goal));
  } catch {
    /* Storage unavailable or blocked: the goal still applies to this session. */
  }
}

/**
 * The target amount a typed string means, or null if it means nothing usable.
 *
 * Thousands separators are accepted because a seven-figure target is typed with them; every
 * other non-numeric character is a rejection rather than something to strip, so "1e9" or
 * "1,0O0" is refused instead of being read as a number the user did not type. Zero, negative
 * and non-finite (including an overflow like 1e999) are all refused: the caller never saves
 * an invalid target, so target > 0 holds for every goal that is ever persisted.
 */
export function parseTargetAmount(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, '');
  if (cleaned === '' || !/^\d*\.?\d*$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

/**
 * Progress towards the goal, as a percentage, or null when it cannot be stated.
 *
 * Null — never a zero and never a guess — is returned when there is no portfolio value to
 * compare, which is how the card shows a dash instead of claiming 0% of the goal is reached.
 * `target` is always positive for a goal that passed the validation above, and it is checked
 * again here so this function is safe for any caller: there is no division by zero.
 *
 * The result is NOT capped. A portfolio past its target really is past it, and saying 100%
 * when it is 112% would be a lie about the user's own money. Only the bar's width is capped
 * (format.ts's barWidth), because a bar cannot be more than full. It is floored at 0, because
 * a negative portfolio is 0% of the way to a positive target, not a negative distance from it.
 */
export function goalProgressPct(current: number | null | undefined, target: number): number | null {
  if (typeof current !== 'number' || !Number.isFinite(current)) return null;
  if (!Number.isFinite(target) || target <= 0) return null;
  return Math.max(0, 100 * current / target);
}

/**
 * One consistent precision rule for the progress figure: at most one decimal, and no
 * meaningless trailing zero. So 13%, 67.4%, 112% — and "<0.1%" rather than a flat "0%" for a
 * funded portfolio that is a very long way from a very large target, because a real balance
 * displayed as 0% reads as no progress at all.
 */
export function formatProgressPct(pct: number | null): string {
  if (pct === null) return '—';
  const rounded = Math.round(pct * 10) / 10;
  if (rounded === 0 && pct > 0) return '<0.1%';
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}
