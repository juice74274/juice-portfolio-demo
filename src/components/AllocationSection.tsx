import { useCallback, useMemo } from 'react';
import type { Portfolio } from '../types';
import { assetTypeLabel, categoryLabel } from '../labels';
import { barWidth, isFiniteNumber, number, percent, signed } from '../format';
import { Icon } from './Icon';
import { AllocationTargetsCard } from './AllocationTargetsCard';
import { categoryTargetPct, useAllocationTargets } from '../allocationTargets';

// The categorical palette has no consumer outside this section, so it moved here with
// the markup. Order is significant: it indexes the allocation rows as rendered.
//
// One Klein Blue ramp, so the page reads as white + #002FA7 and nothing else. Every row still prints
// its own name and its signed number/percentage, so the ramp reinforces the label rather
// than being the only way to tell two rows apart.
const COLORS = ['#002fa7', '#2a55c4', '#5c7fda', '#93aae8', '#c3cff0'];

// Derivations below are pure functions of the snapshot and are consumed only here.
export function AllocationSection({ portfolio, baseCurrency }: { portfolio: Portfolio; baseCurrency: string }) {
  const brokerColor = useCallback((brokerName: string) => {
    const index = portfolio.broker_allocation.findIndex(item => item.broker === brokerName);
    return COLORS[Math.max(0, index) % COLORS.length];
  }, [portfolio]);
  // A positive-width bar cannot represent a negative allocation; the true signed
  // number/percentage stays visible next to it regardless (never abs()'d, never
  // zeroed), and these flag that the bar length itself is not truthful for it.
  const hasNegativeBrokerAllocation = useMemo(
    () => portfolio.broker_allocation.some(item => item.value_base < 0),
    [portfolio],
  );
  // Presentation-only filter: an asset type the snapshot values at exactly zero adds no
  // information to the hierarchy. The snapshot still reports every bucket (it pre-seeds
  // Equity/ETF/Option/Cash), and a negative or non-zero value is never hidden.
  const visibleAssetAllocation = useMemo(
    () => portfolio.asset_allocation.filter(item => item.value_base !== 0),
    [portfolio],
  );
  const hasNegativeAssetAllocation = useMemo(
    () => portfolio.asset_allocation.some(item => item.value_base < 0),
    [portfolio],
  );
  const hasNegativeCategoryAllocation = useMemo(
    () => portfolio.category_allocation.some(item => isFiniteNumber(item.actual_pct) && item.actual_pct < 0),
    [portfolio],
  );
  // The four-layer target is the ONLY displayed target. It is held here, once, because both the
  // card and the table below show it: Save in the card updates this state, and the table's
  // target and deviation columns re-render from it in the same pass. The snapshot's own
  // target_pct / gap_pct are not shown (see allocationTargets.ts).
  const [targets, saveTargets] = useAllocationTargets();
  const categoryRows = useMemo(
    () => portfolio.category_allocation.map(item => {
      const target = categoryTargetPct(targets, item.category);
      // Deviation exists only where both sides do: no target, or no actual, is "—", never 0.
      const gap = target !== null && isFiniteNumber(item.actual_pct) ? item.actual_pct - target : null;
      return { item, target, gap };
    }),
    [portfolio, targets],
  );

  // The whole section is ONE surface. The target editor, the target-vs-actual table and the
  // asset / broker pair are blocks of it, divided by hairlines, each with a small subhead under
  // the single 资产配置 heading. The methodology notes sit behind 数据说明.
  return <section id="allocation" aria-labelledby="allocation-title" className="allocation-section">
    <div className="section-heading"><h2 id="allocation-title">资产配置</h2><span>PORTFOLIO ALLOCATION</span></div>
    <div className="allocation-panel" data-testid="allocation-panel">
      {/* The user's own four-layer target leads the section. Every ACTUAL percentage it shows
          is read straight off the snapshot's category_allocation below; its target is a local
          preference (see allocationTargets.ts), so it adds no request, no category and no
          second classification of anything in this section. */}
      <AllocationTargetsCard categoryAllocation={portfolio.category_allocation} targets={targets} onSave={saveTargets} />

      {/* Personal allocation is the primary allocation view and comes next, full width. */}
      <article className="alloc-block category-card" aria-labelledby="category-title">
        <div className="block-heading">
          <div className="block-title"><h3 id="category-title">个人组合配置</h3><span className="block-eyebrow">CURRENT VS. TARGET</span></div>
          <div className="target-legend"><span><i />实际配置</span><span><b />目标配置</span></div>
          {/* The reading notes, one click away instead of always competing with the table — the
              same native disclosure the overview uses for its method note. The wording is
              unchanged; the one line a reader needs to interpret the "—" cells stays visible
              under the table. */}
          <details className="block-method" data-testid="allocation-method">
            <summary><Icon name="info" /><span>数据说明</span></summary>
            <div className="block-method-body">
              <p className="table-note">债券仓 = 已投资的债券类证券持仓；现金储备 = 券商账户中的未投资现金。</p>
              <p className="table-note">未分类 / Unclassified 是聚合桶，同时包含“待分类”（尚无映射）与“不分类”（已显式指定）两种状态；单个持仓的真实状态见“持仓明细”。</p>
              <p className="table-note">偏离 = 实际配置 − 目标配置，单位为百分点。Unclassified 无目标配置（不属于任何已配置分类，不会计入其他分类）。基金资产为券商汇总的基金净值（不是现金，也不是证券持仓），同样无目标配置。目标比例仅作配置参考。</p>
            </div>
          </details>
        </div>
        <div className="table-scroll"><table className="category-table"><thead><tr><th scope="col">分类</th><th scope="col">分布</th><th scope="col" className="numeric">实际配置</th><th scope="col" className="numeric">目标配置</th><th scope="col" className="numeric">偏离（百分点）</th><th scope="col" className="numeric">金额 · {baseCurrency}</th></tr></thead><tbody>{categoryRows.map(({ item, target, gap }, index) => <tr key={item.category}><th scope="row"><span className="category-dot" style={{ background: COLORS[index % COLORS.length] }} /><span title={item.category}>{categoryLabel(item.category)}</span></th><td><div className="category-track"><span style={{ width: barWidth(item.actual_pct), background: COLORS[index % COLORS.length] }} />{target !== null && <i style={{ left: barWidth(target) }} />}</div></td><td className="numeric">{percent(item.actual_pct)}</td><td className="numeric muted">{percent(target)}</td><td className="numeric"><span className="gap-value">{signed(gap)}</span></td><td className="numeric">{number(item.value_base)}</td></tr>)}</tbody></table></div>
        <p className="table-note category-key">目标配置来自上方四层资产配置目标；债券仓、未分类与基金资产不在四层目标之内，显示 —。</p>
        {hasNegativeCategoryAllocation && <p className="chart-note">部分分类实际配置为负值；数值与占比均如实显示，但分布条长度无法表示负值（负值不按比例显示，视觉长度按 0 处理）。</p>}
      </article>

      {/* Secondary: asset allocation, then a deliberately compact broker allocation. Two columns
          of one block, divided by a hairline, each as tall as its own content. */}
      <div className="allocation-grid">
        <article className="alloc-block asset-card" aria-labelledby="asset-title">
          <div className="block-heading"><div className="block-title"><h3 id="asset-title">资产分布</h3><span className="block-eyebrow">ASSET ALLOCATION</span></div></div>
          <div className="asset-bars">{visibleAssetAllocation.map((item, index) => <div className={`asset-item ${item.value_base < 0 ? 'asset-item-negative' : ''}`} key={item.asset_type}><div className="asset-label"><span><i style={{ background: COLORS[index % COLORS.length] }} />{assetTypeLabel(item.asset_type)}</span><strong>{percent(item.weight_pct)}</strong></div><div className="asset-track"><span style={{ width: barWidth(item.weight_pct), background: COLORS[index % COLORS.length] }} /></div><div className="asset-value">{baseCurrency} {number(item.value_base)}</div></div>)}{visibleAssetAllocation.length === 0 && <p className="empty-state">当前快照没有非零资产类别。</p>}</div>
          {hasNegativeAssetAllocation && <p className="chart-note">部分资产净值为负；数值与占比均如实显示，但柱状条长度无法表示负值（负值不按比例显示，视觉长度按 0 处理）。</p>}
          <div className="asset-footer"><span>持仓市值</span><strong>{baseCurrency} {number(portfolio.summary.positions_value_base)}</strong></div>
          {portfolio.fund_assets && <div className="asset-footer fund-assets-footer"><span>基金资产（券商汇总，非现金、非持仓）</span><strong>{portfolio.fund_assets.currency} {number(portfolio.fund_assets.amount_native)}</strong></div>}
          <p className="table-note">仅显示金额非零的资产类别（零值类别不展示，计算与 API 不变）。</p>
        </article>
        <article className="alloc-block broker-card" aria-labelledby="broker-title">
          <div className="block-heading"><div className="block-title"><h3 id="broker-title">券商分布</h3><span className="block-eyebrow">BROKER ALLOCATION</span></div><span className="small-label">{portfolio.broker_allocation.length} 家券商</span></div>
          <ul className="broker-rows">{portfolio.broker_allocation.map(item => <li key={item.broker}><div className="broker-row-head"><span><i style={{ background: brokerColor(item.broker) }} />{item.broker}</span><b>{percent(item.weight_pct)}</b></div><div className="thin-track"><span style={{ width: barWidth(item.weight_pct), background: brokerColor(item.broker) }} /></div><div className="broker-row-value">{baseCurrency} {number(item.value_base)}</div></li>)}{portfolio.broker_allocation.length === 0 && <li className="empty-state">当前快照暂无券商分布。</li>}</ul>
          {hasNegativeBrokerAllocation && <p className="chart-note">部分券商净值为负（例如空头期权等负债敞口）；数值与占比均如实显示，但分布条长度无法表示负值（负值不按比例显示，视觉长度按 0 处理）。</p>}
        </article>
      </div>
    </div>
  </section>;
}
