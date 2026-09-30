import type { Position } from './types';

// The demo shows no logo images: every holding gets a neutral initial, so the page never
// requests an image for a holding, locally or remotely.

// A market prefix a symbol may carry (US.XYZ), stripped so the initial is the ticker's own.
const MARKET_PREFIX = /^US\./;

// The upper-cased bare ticker (US.XYZ -> XYZ), or null when the symbol is not a plausible
// ticker. For the initial only: the displayed symbol is never changed.
export function normalizeLogoSymbol(symbol: string): string | null {
  const normalized = symbol.trim().toUpperCase().replace(MARKET_PREFIX, '');
  return /^[A-Z0-9][A-Z0-9._-]*$/.test(normalized) ? normalized : null;
}

// An option is shown with its underlying's initial; everything else with its own symbol.
export function logoSymbolFor(position: Position): string {
  return position.option_details?.underlying || position.symbol;
}
