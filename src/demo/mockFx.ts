// The demo's fixed FX table: one static pivot, no provider, no network.
//
// Every amount the demo shows in a currency other than USD — the reporting-currency switch AND
// the wealth-goal conversion, which asks the source for the same snapshot in the goal's currency
// — goes through demoRate() below, so the two can never disagree about what a dollar is worth.
// The rates are round illustrative figures, not market quotes.

import type { FXRate } from '../types';
import type { ReportingCurrency } from '../reportingCurrency';
import { DEMO_AS_OF } from './mockPortfolio';

/** Units of each currency per ONE US dollar. The single source of every demo rate. */
export const DEMO_FX_PER_USD: Readonly<Record<ReportingCurrency, number>> = {
  USD: 1,
  SGD: 1.35,
  CNH: 7.2,
  HKD: 7.8,
};

export const isDemoCurrency = (currency: string): currency is ReportingCurrency =>
  Object.prototype.hasOwnProperty.call(DEMO_FX_PER_USD, currency);

/**
 * Units of `to` per one unit of `from`, through the USD pivot. Triangular by construction, so X->Y->X is exactly 1 up to float
 * rounding. An unknown currency is an error rather than a guessed rate.
 */
export function demoRate(from: string, to: string): number {
  if (!isDemoCurrency(from) || !isDemoCurrency(to)) {
    throw new Error(`演示汇率表中没有 ${isDemoCurrency(from) ? to : from}。`);
  }
  return from === to ? 1 : DEMO_FX_PER_USD[to] / DEMO_FX_PER_USD[from];
}

/** The rates a snapshot reports for `base`, all marked as mock. */
export function demoFxRates(base: ReportingCurrency): FXRate[] {
  return (Object.keys(DEMO_FX_PER_USD) as ReportingCurrency[]).map(currency => ({
    currency, base_currency: base, rate: demoRate(currency, base), as_of: DEMO_AS_OF, source: 'mock',
  }));
}
