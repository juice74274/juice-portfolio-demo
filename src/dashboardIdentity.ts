// Dashboard identity: the user's display name for their own workspace ("Juice's Dashboard").
//
// This is NOT the product brand. The product is always Juice Portfolio, and nothing in this
// file can rename it; the display name only personalises the workspace line under the
// wordmark. It is a PERSONAL UI PREFERENCE, stored exactly like the reporting currency and the
// wealth goal: in localStorage, with no server, no account and no profile behind it.

// Namespaced like the other folio.* keys, so it cannot collide with anything else on the origin.
export const DASHBOARD_IDENTITY_STORAGE_KEY = 'folio.dashboardIdentity';

export const DEFAULT_DISPLAY_NAME = 'Juice';

/** Counted in code points, so a Chinese name gets the same allowance as a Latin one. */
export const MAX_DISPLAY_NAME_LENGTH = 24;

export type DashboardIdentity = { displayName: string };

export const displayNameLength = (name: string) => Array.from(name).length;

/**
 * The display name a typed string means, or null if it cannot be saved.
 *
 * Surrounding whitespace is trimmed and inner runs of whitespace collapse to one space, so a
 * stray double space never reaches the heading. An empty result, a name over the limit, or
 * one containing control characters is refused rather than repaired.
 */
export function normalizeDisplayName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name === '' || displayNameLength(name) > MAX_DISPLAY_NAME_LENGTH) return null;
  if (/\p{Cc}/u.test(name)) return null;
  return name;
}

/** The fixed half of the workspace heading. The sidebar renders it as its own element so a
 *  long name truncates on its own and can never push this part out of view. */
export const DASHBOARD_SUFFIX = "'s Dashboard";

/** The workspace heading for a display name. */
export const dashboardTitle = (displayName: string) => `${displayName}${DASHBOARD_SUFFIX}`;

// The product name is fixed; only the workspace half of the tab title follows the display name.
export const PRODUCT_NAME = 'Juice Portfolio';

/** The browser tab title, e.g. "Juice Portfolio — Jack's Dashboard". */
export const documentTitle = (displayName: string) => `${PRODUCT_NAME} — ${dashboardTitle(displayName)}`;

// Every localStorage access is wrapped, for the reason given in reportingCurrency.ts. A stored
// value is hand-editable and may be stale, so it is validated exactly as strictly as a typed
// one: anything malformed falls back to the default instead of reaching the page.
export function readStoredDisplayName(): string {
  try {
    const raw = window.localStorage.getItem(DASHBOARD_IDENTITY_STORAGE_KEY);
    if (raw === null) return DEFAULT_DISPLAY_NAME;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_DISPLAY_NAME;
    const { displayName } = parsed as Record<string, unknown>;
    if (typeof displayName !== 'string') return DEFAULT_DISPLAY_NAME;
    return normalizeDisplayName(displayName) ?? DEFAULT_DISPLAY_NAME;
  } catch {
    return DEFAULT_DISPLAY_NAME;
  }
}

export function storeDisplayName(displayName: string): void {
  try {
    const identity: DashboardIdentity = { displayName };
    window.localStorage.setItem(DASHBOARD_IDENTITY_STORAGE_KEY, JSON.stringify(identity));
  } catch {
    /* Storage unavailable or blocked: the name still applies to this session. */
  }
}
