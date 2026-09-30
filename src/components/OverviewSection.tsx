import type { Portfolio } from '../types';
import { asOf, isFiniteNumber, number, signed, tone } from '../format';
import type { ReportingCurrency } from '../reportingCurrency';
import { Icon } from './Icon';
import { GoalCard } from './GoalCard';

// The overview owns the states that exist before a snapshot does: it renders while
// loading, on error with no prior snapshot, and on a failed refresh that still shows
// the last good snapshot. `portfolio` is therefore nullable here, unlike the sections
// below it, which the shell renders only once a snapshot exists.
export function OverviewSection({ portfolio, loading, error, refreshing, onRefresh, baseCurrency, currencySymbol, valueInCurrency }: {
  portfolio: Portfolio | null;
  loading: boolean;
  error: string;
  refreshing: boolean;
  onRefresh: () => void;
  baseCurrency: string;
  currencySymbol: string;
  // The shell's cached-only revaluation, passed through to the wealth goal card. The goal is
  // evaluated in its own currency through this one path without changing the currency the
  // page reports in. The overview does not use it itself and never calls it.
  valueInCurrency: (currency: ReportingCurrency, signal: AbortSignal) => Promise<Portfolio>;
}) {
  return <section id="overview" className="overview-section" aria-labelledby="page-title">
    {/* The page title is a section heading like 资产配置 and 持仓明细 below it, so the
        portfolio value — not the product name — carries the first screen. The juice wordmark
        stays in the sidebar. Refresh is a quiet utility at the end of the same row. */}
    <div className="section-heading overview-heading">
      <h1 id="page-title">账户总览</h1>
      <div className="overview-heading-aside">
        <span className="overview-kicker">PORTFOLIO</span>
        <button className="refresh-button" onClick={onRefresh} disabled={refreshing}><Icon name="refresh" className={refreshing ? 'spinning' : ''} /><span>{refreshing ? '刷新中…' : '刷新'}</span></button>
      </div>
    </div>

    {error && <div className="error-banner" role="alert"><div><strong>{portfolio ? '快照刷新失败。' : '无法加载投资组合。'}</strong><p>{error} {portfolio ? '当前仍显示上一次成功加载的快照（未重新获取新数据）。' : '请刷新页面后重试。'}</p></div><button onClick={onRefresh} disabled={refreshing}>重试</button></div>}

    {loading && <div className="loading-state" role="status"><span className="loading-orbit" /><h2>正在汇总账户资产</h2><p>正在加载账户快照…</p></div>}

    {/* ONE surface for the portfolio summary. The total and the P&L share the left column
        (`summary-grid`), the wealth goal sits beside them, and a single quiet status line
        closes it. */}
    <div className={`overview-panel${portfolio ? '' : ' overview-panel-goal-only'}`} data-testid="overview-panel">
      {portfolio && <div className="summary-grid">
        <article className="total-card">
          <div className="metric-label">总资产 <span className="metric-label-en">/ TOTAL VALUE</span><span className="metric-currency">{baseCurrency}</span></div>
          <div className="total-number"><span>{currencySymbol}</span>{number(portfolio.summary.total_value_base)}</div>
          <div className="total-card-bottom"><span>所有账户合计</span><span className="mini-tag">统一折算为 {baseCurrency}</span></div>
        </article>
        <article className="metric-card">
          <div className="metric-label">总未实现盈亏 <span className="metric-label-en">/ TOTAL UNREALIZED P&amp;L</span></div>
          <div className={`metric-number ${tone(portfolio.summary.unrealized_pnl_base)}`}>{signed(portfolio.summary.unrealized_pnl_base)}{isFiniteNumber(portfolio.summary.unrealized_pnl_base) && <span>{baseCurrency}</span>}</div>
          <div className="metric-foot">全部持仓合计（不含现金）</div>
        </article>
      </div>}

      {/* The wealth goal is rendered OUTSIDE the `portfolio &&` block on purpose — it is the
          visitor's own setting, not snapshot data, so it stays readable and editable while a
          snapshot is loading or has failed. It renders a dash for the current value in those
          cases and never a fabricated percentage. */}
      <GoalCard portfolio={portfolio} valueInCurrency={valueInCurrency} />

      {portfolio && <div className="overview-status">
        <div className="snapshot-line"><span className="snapshot-dot" />快照生成时间：{asOf(portfolio.as_of)} UTC<span className="snapshot-divider">·</span><span>{portfolio.accounts.length} 个模拟账户</span><span className="snapshot-divider">·</span><span>汇率 固定模拟汇率</span></div>
        {/* The valuation disclosure, one click away instead of competing with the figures. */}
        <details className="overview-method">
          <summary><Icon name="info" /><span>数据说明</span></summary>
          <div className="overview-method-body">
            <p className="method-note">固定模拟快照：刷新会重新读取相同数据；现金与持仓数量保持不变。</p>
          </div>
        </details>
      </div>}
    </div>
  </section>;
}
