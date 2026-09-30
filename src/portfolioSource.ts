// Where the dashboard's portfolio comes from, as ONE seam.
//
// The dashboard needs exactly two things from outside its components: a portfolio snapshot, and
// a place to write one holding's classification. Everything else it shows — accounts, FX rates,
// allocations, freshness metadata — is carried inside that one snapshot. This interface is those
// two operations and nothing more.
//
// What stays OUT of a source, deliberately:
//
// * Validation. A source hands back what it read, and App.tsx's fetchSnapshot still refuses a
//   snapshot whose mode, shape or freshness metadata it cannot trust. The rules live once, at
//   the UI boundary, whatever the source.
// * Ordering. Single-flight Refresh, response supersession, generation and instance checks,
//   reconciliation and currency intent all stay in App.tsx. A source answers one read at a time
//   and knows nothing about which answer the page ends up displaying.

import type { Portfolio, PortfolioMode, ClassificationScope } from './types';
import type { ReportingCurrency } from './reportingCurrency';
import type { ClassificationCategoryKey } from './classification';
import type { WealthGoal } from './goal';
import { demoPortfolioSource } from './demo/demoPortfolioSource';

/** One snapshot read, stated as what the caller wants. */
export type SnapshotQuery = {
  /** The reporting currency to value in, or null for the source's default. */
  currency: ReportingCurrency | null;
  /** True asks for fresh holdings; false revalues the holdings already read. */
  refreshBrokers: boolean;
  /** With refreshBrokers false: fail rather than read afresh when nothing has been read yet. */
  requireCached: boolean;
};

export interface PortfolioSource {
  readonly kind: 'demo';

  /**
   * Read one snapshot. Resolves with the snapshot as read — NOT yet validated; the caller
   * validates it — and rejects with an Error whose message is safe to show.
   */
  readSnapshot(query: SnapshotQuery, signal?: AbortSignal): Promise<Portfolio>;

  /**
   * Whether this source can persist a classification edit for a snapshot in `mode`. Undefined
   * means no snapshot is on screen yet, and nothing is editable then.
   */
  classificationWritable(mode: PortfolioMode | undefined): boolean;

  /** Persist one broker+symbol mapping. Resolves on success; rejects with a showable Error. */
  saveClassification(
    brokerKey: ClassificationScope, symbol: string, category: ClassificationCategoryKey,
    signal?: AbortSignal,
  ): Promise<void>;

  /**
   * The wealth goal to show before the visitor saves one, when the source has an opinion.
   * Absent, the goal card keeps its own default (goal.ts defaultGoal), which follows the
   * currency on screen.
   */
  readonly defaultGoal?: WealthGoal;
}

/** The one source this app reads from: the fabricated, static demo portfolio. */
export const portfolioSource: PortfolioSource = demoPortfolioSource;
