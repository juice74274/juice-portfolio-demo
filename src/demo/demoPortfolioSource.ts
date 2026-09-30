// The demo's PortfolioSource: a fabricated, static portfolio valued in the browser.
//
// It answers the two questions every PortfolioSource answers, with the full Portfolio shape:
//
// * No network, ever. A read values the static snapshot (valuePortfolio.ts) in the requested
//   currency; a Refresh is the same read, so it rebuilds the identical snapshot. The visitor's
//   own preferences — dashboard name, wealth goal, allocation targets, classification edits —
//   live in localStorage and are untouched by a read.
// * One generation, one instance. The holdings never change, so there is exactly one set of
//   them: a fixed, non-zero generation from a fixed, demo-specific instance. Every read is
//   therefore equally fresh, and the page's ordering rules adopt the newest one as usual.
// * Classification is writable in its mock mode, because here an edit really does show: it is
//   stored locally and applied by the next read.

import type { PortfolioSource, SnapshotQuery } from '../portfolioSource';
import type { ClassificationScope, Portfolio, PortfolioMode } from '../types';
import type { ClassificationCategoryKey } from '../classification';
import type { ReportingCurrency } from '../reportingCurrency';
import type { WealthGoal } from '../goal';
import { valuePortfolio } from './valuePortfolio';
import { isDemoSymbol, readStoredDemoEdits, storeDemoEdit } from './demoClassification';

/** Stable and non-zero: 0 would mean "never authoritative" to the page. */
export const DEMO_NATIVE_GENERATION = 1;
/** Names the demo's one static snapshot. */
export const DEMO_INSTANCE_ID = 'demo-static-2026-09-30';

/** What a read with no currency preference reports in. */
export const DEMO_DEFAULT_CURRENCY: ReportingCurrency = 'USD';

/** The demo investor's goal until the visitor sets their own. */
export const DEMO_DEFAULT_GOAL: WealthGoal = { target: 1_000_000, currency: 'USD' };

const aborted = () => new DOMException('The operation was aborted.', 'AbortError');

async function readSnapshot({ currency }: SnapshotQuery, signal?: AbortSignal): Promise<Portfolio> {
  if (signal?.aborted) throw aborted();
  return valuePortfolio(currency ?? DEMO_DEFAULT_CURRENCY, readStoredDemoEdits(), {
    generation: DEMO_NATIVE_GENERATION, instanceId: DEMO_INSTANCE_ID,
  });
}

async function saveClassification(
  scope: ClassificationScope, symbol: string, category: ClassificationCategoryKey,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw aborted();
  // Only the demo's own rows can be edited; anything else is refused, never stored.
  if (scope !== 'demo' || !isDemoSymbol(symbol)) throw new Error('演示数据中没有这个持仓，分类未保存。');
  storeDemoEdit(symbol, category);
}

export const demoPortfolioSource: PortfolioSource = {
  kind: 'demo',
  readSnapshot,
  classificationWritable: (mode: PortfolioMode | undefined) => mode !== undefined,
  saveClassification,
  defaultGoal: DEMO_DEFAULT_GOAL,
};
