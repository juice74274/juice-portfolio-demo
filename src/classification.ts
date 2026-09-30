// The client side of the ONE local metadata write — its identity, category vocabulary and
// editing rules. The write itself goes through the PortfolioSource (portfolioSource.ts); in the
// demo it is stored in this browser's localStorage (demo/demoClassification.ts).
//
// What this module deliberately does NOT do:
//
// * It never normalizes a symbol. No upper-casing, no trimming, no prefix repair — the
//   symbol is saved exactly as the snapshot reported it in Position.symbol, because
//   "helpfully" cleaning one here would only ever write the wrong mapping.
// * It never infers or fabricates a broker. The canonical scope key comes from
//   Position.broker_key; the frontend round-trips that value and never maps a display
//   string itself.
// * It never sends an account id, a quantity, a price or a portfolio value. Classification
//   is broker+symbol scoped, not account scoped.
// * A save writes local organization metadata only; the holdings, their native amounts and
//   their P&L are untouched by it.

import type { BrokerKey, ClassificationScope, ClassificationState, Position } from './types'
import { normalizeCategory } from './labels'

// The exact category spellings a save accepts. Anything else is refused rather than
// substituted.
export const CLASSIFICATION_CATEGORY_KEYS = ['core', 'mid', 'high_beta', 'bonds', 'unclassified'] as const
export type ClassificationCategoryKey = (typeof CLASSIFICATION_CATEGORY_KEYS)[number]

// API category -> the config spelling a write uses. The API category is what a snapshot
// reports; the config spelling is what the file (and therefore the write API) stores.
const CATEGORY_KEY_BY_API: Readonly<Record<string, ClassificationCategoryKey>> = {
  Core: 'core',
  Mid: 'mid',
  'High Beta': 'high_beta',
  Bonds: 'bonds',
  Unclassified: 'unclassified',
}

// A position with no mapping entry has no category to select: 'needs classification' is
// the ABSENCE of a mapping, not a value that could be written. The selector therefore
// shows an unselectable placeholder, whose value is this empty string.
export const NEEDS_CLASSIFICATION_VALUE = ''

/** Identity of one classification mapping. Two rows for the same broker+symbol in
 *  different accounts share it, which is exactly why they save and update together. */
export const classificationKey = (brokerKey: string, symbol: string) => `${brokerKey}\u0000${symbol}`

/** The key for a position's row, or null when the snapshot supplied no canonical broker
 *  identity — in which case the row stays read-only rather than guessing one. */
export const positionClassificationKey = (position: Position) =>
  position.broker_key ? classificationKey(position.broker_key, position.symbol) : null

/** Whether this row can be edited at all. A snapshot without broker_key (such as a
 *  hand-built fixture) renders the classification as a read-only tag. */
export const isEditable = (position: Position): position is Position & { broker_key: ClassificationScope } =>
  typeof position.broker_key === 'string' && position.broker_key.length > 0

/** Every canonical broker scope key a snapshot's broker status may name. It lives here
 *  because this module already owns the classification broker-key contract. */
export const BROKER_KEYS: readonly BrokerKey[] = ['moomoo', 'tiger', 'webull', 'usmart']

/** Whether a value is one of those keys, for validating snapshot data. */
export const isBrokerKey = (value: unknown): value is BrokerKey =>
  typeof value === 'string' && (BROKER_KEYS as readonly string[]).includes(value)

/**
 * The option the selector should show as selected.
 *
 * `needs_classification` maps to the placeholder rather than to 'unclassified', because
 * the two are different facts: no mapping exists at all versus the user deliberately
 * mapped it to unclassified. Collapsing them would make an action item look like a
 * decision the user had already taken.
 *
 * `state` must be the NORMALIZED classification state (labels.normalizeClassificationState),
 * not the raw optional field: an absent state degrades by category alone. Passing the raw value here would let the selected
 * option disagree with the state the row displays.
 *
 * The category is normalized too, so an unrecognized value degrades to the unclassified
 * bucket instead of resolving to no option at all — which a native <select> would silently
 * "fix" by selecting its first option, i.e. by showing a category nobody chose.
 */
export function selectedCategoryKey(
  category: string,
  normalizedState: ClassificationState,
): ClassificationCategoryKey | typeof NEEDS_CLASSIFICATION_VALUE {
  if (normalizedState === 'needs_classification') return NEEDS_CLASSIFICATION_VALUE
  return CATEGORY_KEY_BY_API[normalizeCategory(category)] ?? NEEDS_CLASSIFICATION_VALUE
}

export const isCategoryKey = (value: string): value is ClassificationCategoryKey =>
  (CLASSIFICATION_CATEGORY_KEYS as readonly string[]).includes(value)
