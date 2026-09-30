import { normalizeLogoSymbol } from '../holdingLogos';

// A holding's quiet initial in a fixed 32px box. Decorative: the symbol is always printed
// beside it, so it is hidden from assistive technology.
export function HoldingLogo({ symbol }: { symbol: string }) {
  // The ticker's initial, not a market prefix (US.XYZ shows X, not U).
  const initial = (normalizeLogoSymbol(symbol) ?? symbol).slice(0, 1);
  return <span className="holding-logo holding-logo-fallback" aria-hidden="true">{initial}</span>;
}
