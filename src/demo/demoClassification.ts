// The demo's classification: the visitor's own edits, which persist in THIS browser's
// localStorage and nowhere else. Nothing is pre-set — every holding starts unclassified, so the
// visitor tries the classification feature themselves.
//
// It produces the two facts every snapshot carries per position — `category` and
// `classification_state` — so the UI edits a demo row exactly as it would any other.

import type { ClassificationState, PositionCategory } from '../types';
import { isCategoryKey, type ClassificationCategoryKey } from '../classification';
import { DEMO_HOLDINGS } from './mockPortfolio';

// Namespaced like the other folio.* preferences and separate from them: it is edited on its own.
export const DEMO_CLASSIFICATION_STORAGE_KEY = 'folio.demoClassification';

/** Category key -> the category a snapshot reports. */
const API_CATEGORY: Readonly<Record<ClassificationCategoryKey, PositionCategory>> = {
  core: 'Core', mid: 'Mid', high_beta: 'High Beta', bonds: 'Bonds', unclassified: 'Unclassified',
};

const DEMO_SYMBOLS: ReadonlySet<string> = new Set(DEMO_HOLDINGS.map(holding => holding.symbol));

export const isDemoSymbol = (symbol: string) => DEMO_SYMBOLS.has(symbol);

export type DemoClassification = { category: PositionCategory; classification_state: ClassificationState };

// This session's edits, kept even when storage is unavailable (a private window, blocked site
// data), so an edit still shows for as long as the page is open.
const sessionEdits = new Map<string, ClassificationCategoryKey>();

/**
 * The visitor's stored edits. Hand-editable and possibly stale, so validated strictly: only a
 * known demo symbol mapped to a known category key survives; anything else is ignored.
 */
export function readStoredDemoEdits(): Map<string, ClassificationCategoryKey> {
  const edits = new Map<string, ClassificationCategoryKey>();
  try {
    const raw = window.localStorage.getItem(DEMO_CLASSIFICATION_STORAGE_KEY);
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      for (const [symbol, category] of Object.entries(parsed as Record<string, unknown>)) {
        if (isDemoSymbol(symbol) && typeof category === 'string' && isCategoryKey(category)) {
          edits.set(symbol, category);
        }
      }
    }
  } catch {
    /* Unreadable storage and unparseable JSON both mean: no stored edits. */
  }
  for (const [symbol, category] of sessionEdits) edits.set(symbol, category);
  return edits;
}

/** Remember one edit, in this session and — when it is available — in localStorage. */
export function storeDemoEdit(symbol: string, category: ClassificationCategoryKey): void {
  sessionEdits.set(symbol, category);
  const edits = Object.fromEntries(readStoredDemoEdits());
  try {
    window.localStorage.setItem(DEMO_CLASSIFICATION_STORAGE_KEY, JSON.stringify(edits));
  } catch {
    /* Storage unavailable or blocked: the edit still applies to this session. */
  }
}

/**
 * One holding's category and why it has it, by the usual rule: a real category
 * is `assigned`, an explicit `unclassified` is `unassigned` (a decision), and a symbol with no
 * mapping at all `needs_classification` (an action item).
 */
export function classifyDemoSymbol(
  symbol: string, edits: ReadonlyMap<string, ClassificationCategoryKey>,
): DemoClassification {
  const key = edits.get(symbol);
  if (key === undefined) return { category: 'Unclassified', classification_state: 'needs_classification' };
  return {
    category: API_CATEGORY[key],
    classification_state: key === 'unclassified' ? 'unassigned' : 'assigned',
  };
}
