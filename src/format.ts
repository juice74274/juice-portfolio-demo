// Display formatting shared by the dashboard sections. None of these helpers is
// currency-, broker- or mode-aware beyond what it is given.

export const UNAVAILABLE = '—';
// Format numbers independently of currency-symbol lookup. CNH keeps an explicit
// code, distinct from CNY; unknown base currencies fall back to their own code.
// Per-position native amounts always use the full currency code below.
const CURRENCY_PREFIXES: Readonly<Record<string, string>> = {
  CNH: 'CNH', CNY: '¥', USD: '$', SGD: 'S$', HKD: 'HK$',
};
export const currencyPrefix = (currency: string) => CURRENCY_PREFIXES[currency] ?? currency;
const moneyFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const quantityFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });

// Every numeric/text formatter below is null-safe: a snapshot can carry null for an
// unavailable metric, and this must never render as "undefined"/"NaN".
export const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export const number = (value: number | null | undefined) => isFiniteNumber(value) ? moneyFormat.format(value) : UNAVAILABLE;
export const signed = (value: number | null | undefined) =>
  isFiniteNumber(value) ? `${value > 0 ? '+' : value < 0 ? '−' : ''}${moneyFormat.format(Math.abs(value))}` : UNAVAILABLE;
// The snapshot's position.currency is authoritative, including CNH and future codes.
// An unavailable amount stays a standalone dash, never a zero or a currency guess.
export const nativeAmount = (value: number | null | undefined, currency: string, showSign = false) =>
  isFiniteNumber(value) ? `${currency} ${showSign ? signed(value) : number(value)}` : UNAVAILABLE;
export const tone = (value: number | null | undefined) => isFiniteNumber(value) ? (value > 0 ? 'positive' : value < 0 ? 'negative' : '') : 'muted';
export const percent = (value: number | null | undefined) => isFiniteNumber(value) ? `${moneyFormat.format(value)}%` : UNAVAILABLE;
// Distinct from percent(): adds an explicit +/− sign for a signed percentage change,
// but — like every helper here — renders exactly "—" for null, never "—%".
export const signedPercent = (value: number | null | undefined) =>
  isFiniteNumber(value) ? `${value > 0 ? '+' : value < 0 ? '−' : ''}${moneyFormat.format(Math.abs(value))}%` : UNAVAILABLE;
export const barWidth = (value: number | null | undefined) => `${isFiniteNumber(value) ? Math.min(100, Math.max(0, value)) : 0}%`;
export const text = (value: string | null | undefined) => value ?? UNAVAILABLE;

export function asOf(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }).format(new Date(value));
}
