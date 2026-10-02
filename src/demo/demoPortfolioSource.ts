// Static public source: fabricated holdings and browser-local organization only.
// Refresh and currency changes recompute the same fixture; no network or broker code runs.
import type { PortfolioSource, SnapshotQuery } from '../portfolioSource';
import type { ClassificationScope, Portfolio, PortfolioMode } from '../types';
import type { ClassificationCategoryKey } from '../classification';
import type { ReportingCurrency } from '../reportingCurrency';
import type { WealthGoal } from '../goal';
import { valuePortfolio } from './valuePortfolio';
import { readDemoOrganization, assignDemoHolding } from './demoOrganization';
import { DEMO_HOLDINGS } from './mockPortfolio';

/** Stable and non-zero: 0 would mean "never authoritative" to the page. */
export const DEMO_NATIVE_GENERATION = 1;
/** Names the demo's one static snapshot. */
export const DEMO_INSTANCE_ID = 'demo-static-2026-10-01';

/** What a read with no currency preference reports in. */
export const DEMO_DEFAULT_CURRENCY: ReportingCurrency = 'USD';

/** The demo investor's goal until the visitor sets their own. */
export const DEMO_DEFAULT_GOAL: WealthGoal = { target: 1_000_000, currency: 'USD' };

const aborted = () => new DOMException('The operation was aborted.', 'AbortError');

async function readSnapshot({ currency }: SnapshotQuery, signal?: AbortSignal): Promise<Portfolio> {
  if (signal?.aborted) throw aborted();
  return valuePortfolio(currency ?? DEMO_DEFAULT_CURRENCY, readDemoOrganization(), {
    generation: DEMO_NATIVE_GENERATION, instanceId: DEMO_INSTANCE_ID,
  });
}

async function saveClassification(
  scope: ClassificationScope, symbol: string, category: ClassificationCategoryKey,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw aborted();
  // Only the demo's own rows can be edited; anything else is refused, never stored.
  if (scope !== 'demo' || !DEMO_HOLDINGS.some(holding => holding.symbol === symbol)) throw new Error('演示数据中没有这个持仓，分类未保存。');
  assignDemoHolding(symbol, category === 'unclassified' ? null : category);
}

export const demoPortfolioSource: PortfolioSource = {
  kind: 'demo',
  readSnapshot,
  classificationWritable: (mode: PortfolioMode | undefined) => mode === 'mock',
  saveClassification,
  defaultGoal: DEMO_DEFAULT_GOAL,
};
