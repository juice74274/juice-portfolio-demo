import type { FXRate } from '../types';
import { asOf, quantityFormat } from '../format';
import { Icon } from './Icon';

// FX is acknowledged, not featured: provenance and time stay disclosed here in one compact
// strip. The demo's fixed rates are never presented as real-time.
export function FxStrip({ fxRates, baseCurrency }: {
  fxRates: FXRate[];
  baseCurrency: string;
}) {
  // Identity rows (1 USD = 1 USD) stay in the data but are pointless to display.
  const visibleFxRates = fxRates.filter(rate => rate.currency !== rate.base_currency);
  const updated = fxRates[0] ? `汇率时间 ${asOf(fxRates[0].as_of)} UTC` : '';

  // One compact status line — reporting currency, source and time. Every rate the dashboard
  // used sits behind the same 数据说明 disclosure as the overview, allocation and holdings.
  return <div className="fx-strip">
    <div className="fx-summary">
      <span className="fx-strip-label">汇率 FX</span>
      <span className="fx-strip-item">统计币种 <strong>{baseCurrency}</strong></span>
      <span className="fx-strip-item mock-label">固定模拟汇率</span>
      {updated && <span className="fx-strip-item">{updated}</span>}
    </div>
    <details className="block-method" data-testid="fx-method">
      <summary><Icon name="info" /><span>数据说明</span></summary>
      <div className="block-method-body">
        {visibleFxRates.length > 0 && <div className="fx-rates">
          {visibleFxRates.map(rate => <span className="fx-strip-item fx-rate" key={rate.currency}>1 {rate.currency} = {quantityFormat.format(rate.rate)} {rate.base_currency}</span>)}
        </div>}
        {fxRates[0] && <p className="fx-asof">汇率时间：{asOf(fxRates[0].as_of)} UTC</p>}
        <p className="fx-note">使用固定模拟汇率，并非实时市场汇率。</p>
      </div>
    </details>
  </div>;
}
