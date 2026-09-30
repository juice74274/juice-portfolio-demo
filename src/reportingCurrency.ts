// The portfolio reporting currency the user can select.
//
// This is a DISPLAY preference, not portfolio metadata: it changes only which currency
// the portfolio-level aggregates are reported in, so it lives in localStorage. The source is
// the authority on the valuation itself — the page asks for a currency and then reports
// whatever `portfolio.base_currency` comes back.

// The currencies the source can value the portfolio in (the demo's fixed FX table covers each).
export const REPORTING_CURRENCIES = ['CNH', 'USD', 'SGD', 'HKD'] as const;
export type ReportingCurrency = (typeof REPORTING_CURRENCIES)[number];

// Namespaced so it cannot collide with anything else on the same origin.
export const REPORTING_CURRENCY_STORAGE_KEY = 'folio.reportingCurrency';

export const isReportingCurrency = (value: unknown): value is ReportingCurrency =>
  typeof value === 'string' && (REPORTING_CURRENCIES as readonly string[]).includes(value);

// Every localStorage access is wrapped: in a private window, with site data blocked, or
// under a storage quota error the accessor itself can throw. A dashboard must never fail
// to render because a display preference could not be read or written.
export function readStoredReportingCurrency(): ReportingCurrency | null {
  try {
    // An unrecognised stored value (hand-edited, stale, or from a future allowlist) is
    // ignored rather than requested, so the page falls back to the source's default instead
    // of asking for a currency that would be refused.
    const stored = window.localStorage.getItem(REPORTING_CURRENCY_STORAGE_KEY);
    return isReportingCurrency(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function storeReportingCurrency(currency: ReportingCurrency): void {
  try {
    window.localStorage.setItem(REPORTING_CURRENCY_STORAGE_KEY, currency);
  } catch {
    /* Storage unavailable or blocked: the selection still applies to this session. */
  }
}
