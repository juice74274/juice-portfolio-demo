import { REPORTING_CURRENCIES, isReportingCurrency, type ReportingCurrency } from '../reportingCurrency';

// The 统计币种 badge is a compact selector. `reportingCurrency` is the currency of the
// snapshot currently ON SCREEN, not the one last requested: a failed switch must not relabel
// the page as a currency whose numbers were never received. When the displayed snapshot's base
// currency is outside the selectable allowlist (or there is no snapshot yet), it stays a
// read-only badge.
//
// `switching` means a snapshot request is in flight: the selector is disabled for the duration
// so a switch and a refresh cannot be stacked. It is not the refresh button's own spinner
// state — a currency switch is not a refresh and must not look like one.
export function Topbar({ modeKnown, baseCurrency, reportingCurrency, onReportingCurrencyChange, switching }: {
  modeKnown: boolean;
  baseCurrency: string;
  reportingCurrency: ReportingCurrency | null;
  onReportingCurrencyChange: (currency: ReportingCurrency) => void;
  switching: boolean;
}) {
  return <header className="topbar"><div className="topbar-badges"><span className="mock-badge"><span />{modeKnown ? '模拟数据' : '状态未知'}</span><span className="currency-badge"><span className="currency-badge-label">统计币种</span>{reportingCurrency
    ? <select className="currency-select" aria-label="统计币种" value={reportingCurrency} disabled={switching}
        onChange={event => { if (isReportingCurrency(event.target.value)) onReportingCurrencyChange(event.target.value); }}>
        {REPORTING_CURRENCIES.map(currency => <option key={currency} value={currency}>{currency}</option>)}
      </select>
    : <strong>{baseCurrency}</strong>}</span></div></header>;
}
