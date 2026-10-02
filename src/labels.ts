// Presentation labels for normalized snapshot values and browser-local group names.
import type { ClassificationState } from './types';

const categoryLabels: Readonly<Record<string, string>> = {
  Core: '核心仓',
  Mid: '中等仓位',
  'High Beta': '高弹性仓',
  Bonds: '债券仓',
  Cash: '现金储备',
  'Fund Assets': '基金资产',
  // Aggregate bucket only. It combines both unclassified states (see positionCategoryLabel),
  // so it stays deliberately neutral rather than claiming either one.
  Unclassified: '未分类 / Unclassified',
};

// Position-level wording for the two distinct unclassified states. A missing mapping is
// an action item; an explicit unclassified mapping is the user's decision.
const classificationStateLabels: Readonly<Record<string, string>> = {
  needs_classification: '待分类 / Needs classification',
  unassigned: '不分类 / Unassigned',
};

const assetTypeLabels: Readonly<Record<string, string>> = {
  Equity: '股票 / Equity',
  ETF: 'ETF',
  Option: '期权 / Option',
  Security: '证券 / Security',
  Cash: '现金',
  'Fund Assets': '基金资产',
};

const optionRightLabels: Readonly<Record<string, string>> = {
  CALL: '看涨 CALL',
  PUT: '看跌 PUT',
};

// A nonempty custom group name is shown as supplied; absent values degrade to Unclassified.
export const normalizeCategory = (value: string | null | undefined) =>
  value && value.trim() ? value : 'Unclassified';
export const categoryLabel = (value: string) => categoryLabels[normalizeCategory(value)] ?? normalizeCategory(value);
// An absent state degrades by category alone and can never infer 'unassigned',
// matching the source's own inference rule.
export const normalizeClassificationState = (
  state: string | null | undefined, category: string,
): ClassificationState =>
  // The cast is safe by construction: classificationStateLabels is keyed by the two
  // non-assigned states, so a hit is one of them and anything else takes a literal branch.
  state != null && Object.hasOwn(classificationStateLabels, state) ? state as ClassificationState
    : normalizeCategory(category) === 'Unclassified' ? 'needs_classification' : 'assigned';
// The label a single position shows: assigned positions keep their category label,
// while the two unclassified states are named distinctly.
export const positionCategoryLabel = (category: string, state?: string | null) => {
  const resolved = normalizeClassificationState(state, category);
  return classificationStateLabels[resolved] ?? categoryLabel(category);
};
export const assetTypeLabel = (value: string) => assetTypeLabels[value] ?? value;
export const optionRightLabel = (value: string) => optionRightLabels[value] ?? value;
