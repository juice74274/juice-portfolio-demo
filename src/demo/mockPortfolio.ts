// The public demo's portfolio: a FABRICATED investor, stated as native facts only.
//
// Nothing here is derived from any real account. The quantities, average costs and cash are
// invented so that the story reads plausibly — USD 300,000 of starting capital, most of it
// invested, some winners, some losers, positive overall.
//
// The PRICES are not invented: they are a frozen market reference snapshot (see
// DEMO_PRICE_SNAPSHOT below). There is no quote API: the demo never fetches or changes a price
// at runtime, and nothing in its bundle can.
//
// Only what a broker would report lives here. Every derived number (market values, P&L,
// totals, allocations, FX) is computed from these facts by valuePortfolio.ts.

import type { Account, AssetType } from '../types';

/**
 * The static price snapshot: approximate public reference prices around 2026-09-29 /
 * 2026-09-30, rounded for demonstration. Not re-verified against a market-data provider. Small
 * rounding is intended — it is a frozen demo fixture, not a quote.
 */
export const DEMO_PRICE_SNAPSHOT = { date: '2026-09-30', basis: 'approximate public reference prices, rounded for demonstration' } as const;

/** The snapshot's `as_of`: the price snapshot's date. Nothing is ever re-read. */
export const DEMO_AS_OF = '2026-09-30T20:00:00Z';

/** The demo investor's starting capital, in USD: cost basis of every holding plus cash. */
export const DEMO_INITIAL_CAPITAL_USD = 300_000;

export const DEMO_BROKER = 'Demo';

export const DEMO_ACCOUNT: Account = {
  id: 'demo-account',
  broker: DEMO_BROKER,
  name: 'Demo Portfolio',
  account_type: 'mock',
  base_currency: 'USD',
};

export type DemoHolding = {
  symbol: string;
  name: string;
  asset_type: AssetType;
  /** Whole shares. */
  quantity: number;
  /** Fabricated average cost per share, USD. */
  average_cost: number;
  /** Reference price per share, USD, from DEMO_PRICE_SNAPSHOT. */
  price: number;
};

// No holding carries a category: every one starts UNCLASSIFIED (needs classification), so the
// visitor classifies them. Edits live in localStorage (demoClassification.ts). There is no
// previous close either — a single frozen snapshot has no day's move, so daily P&L is
// unavailable rather than invented.

export const DEMO_HOLDINGS: readonly DemoHolding[] = [
  { symbol: 'GOOG', name: 'Alphabet Inc. Class C', asset_type: 'Equity', quantity: 150, average_cost: 300, price: 335.74 },
  { symbol: 'MSFT', name: 'Microsoft Corp.', asset_type: 'Equity', quantity: 90, average_cost: 450, price: 508.69 },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', asset_type: 'Equity', quantity: 250, average_cost: 190, price: 229.73 },
  { symbol: 'AVGO', name: 'Broadcom Inc.', asset_type: 'Equity', quantity: 100, average_cost: 330, price: 358 },
  { symbol: 'SNOW', name: 'Snowflake Inc.', asset_type: 'Equity', quantity: 80, average_cost: 350, price: 330 },
  { symbol: 'RKLB', name: 'Rocket Lab Corp.', asset_type: 'Equity', quantity: 300, average_cost: 80, price: 70 },
  { symbol: 'LITE', name: 'Lumentum Holdings Inc.', asset_type: 'Equity', quantity: 20, average_cost: 850, price: 980 },
  { symbol: 'NBIS', name: 'Nebius Group N.V.', asset_type: 'Equity', quantity: 100, average_cost: 260, price: 237 },
];

/**
 * The uninvested USD cash: starting capital minus the cost basis of every holding, so the
 * "started from USD 300,000" story is an identity rather than a coincidence.
 */
export const DEMO_CASH_USD = DEMO_INITIAL_CAPITAL_USD
  - DEMO_HOLDINGS.reduce((total, holding) => total + holding.quantity * holding.average_cost, 0);
