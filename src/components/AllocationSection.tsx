import { useCallback, useMemo, useState } from 'react';
import type { Portfolio } from '../types';
import { assetTypeLabel } from '../labels';
import { barWidth, isFiniteNumber, number, percent, signed } from '../format';
import { Icon } from './Icon';
import { TargetPlanEditor } from './TargetPlanEditor';
import { GroupManager } from './GroupManager';

const COLORS = ['#002fa7', '#2a55c4', '#5c7fda', '#93aae8', '#c3cff0'];
export function AllocationSection({ portfolio, baseCurrency, onChanged }: {
  portfolio: Portfolio; baseCurrency: string; onChanged: () => void;
}) {
  const [targetOpen, setTargetOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const organization = portfolio.organization;
  const brokerColor = useCallback((brokerName: string) => {
    const index = portfolio.broker_allocation.findIndex(item => item.broker === brokerName);
    return COLORS[Math.max(0, index) % COLORS.length];
  }, [portfolio]);
  const hasNegativeBrokerAllocation = useMemo(() =>
    portfolio.broker_allocation.some(item => item.value_base < 0), [portfolio]);
  const visibleAssetAllocation = useMemo(() =>
    portfolio.asset_allocation.filter(item => item.value_base !== 0), [portfolio]);
  const hasNegativeAssetAllocation = useMemo(() =>
    portfolio.asset_allocation.some(item => item.value_base < 0), [portfolio]);
  const hasNegativeCategoryAllocation = useMemo(() =>
    portfolio.category_allocation.some(item => isFiniteNumber(item.actual_pct) && item.actual_pct < 0), [portfolio]);
  if (!organization) return null;
  const cashRow = portfolio.category_allocation.find(row => row.category === 'Cash');
  const groupRows = organization.groups.map(group => ({
    group, row: portfolio.category_allocation.find(row => row.category === group.name),
  }));
  const ungrouped = portfolio.category_allocation.find(row => row.category === 'Unclassified');
  const rows = [
    ...groupRows.map(({ group, row }) => ({ key: group.id, label: group.name, row, target: organization.targets[group.id] })),
    { key: 'cash', label: '现金 / Cash', row: cashRow, target: organization.cashTarget },
    ...(ungrouped ? [{ key: 'ungrouped', label: '未分组 / Ungrouped', row: ungrouped, target: null }] : []),
  ];
  return <section id="allocation" aria-labelledby="allocation-title" className="allocation-section">
    <div className="section-heading"><h2 id="allocation-title">资产配置</h2><span>PORTFOLIO ALLOCATION</span></div>
    <div className="allocation-panel" data-testid="allocation-panel">
      <article className="alloc-block category-card" aria-labelledby="category-title">
        <div className="block-heading">
          <div className="block-title"><h3 id="category-title">个人组合配置</h3><span className="block-eyebrow">ALLOCATION GROUPS</span></div>
          <button type="button" className="alloc-edit-button" data-testid="manage-groups" onClick={() => setManagerOpen(true)}><Icon name="pencil" />管理分组</button>
          <button type="button" className="alloc-edit-button" data-testid="edit-targets" aria-expanded={targetOpen}
            aria-controls="target-editor-container" onClick={() => setTargetOpen(open => !open)}><Icon name="pencil" />{targetOpen ? '收起目标' : '编辑目标'}</button>
          <div className="target-legend"><span><i />实际配置</span><span><b />目标配置</span></div>
          <details className="block-method" data-testid="allocation-method"><summary><Icon name="info" /><span>数据说明</span></summary>
            <div className="block-method-body"><p className="table-note">分组为本地演示配置。实际配置来自虚构持仓；现金单列。偏离为实际减目标，单位为百分点。</p></div>
          </details>
        </div>
        <div className="table-scroll"><table className="category-table"><thead><tr>
          <th scope="col">分组</th><th scope="col">分布</th><th scope="col" className="numeric">实际配置</th>
          <th scope="col" className="numeric">目标配置</th><th scope="col" className="numeric">偏离（百分点）</th>
          <th scope="col" className="numeric">金额 · {baseCurrency}</th></tr></thead><tbody>
          {rows.map(({ key, label, row, target }, index) => {
            const actual = row?.actual_pct ?? null;
            const gap = target === null || actual === null ? null : actual - target;
            return <tr key={key} data-group-id={key}><th scope="row"><span className="category-dot" style={{ background: COLORS[index % COLORS.length] }} />{label}</th>
              <td><div className="category-track"><span style={{ width: barWidth(actual), background: COLORS[index % COLORS.length] }} />
                {target !== null && <i style={{ left: barWidth(target) }} />}</div></td>
              <td className="numeric">{percent(actual)}</td><td className="numeric muted" data-testid={`alloc-target-${key}`}>{target === null ? '—' : `${target}%`}</td>
              <td className="numeric"><span className="gap-value">{signed(gap)}</span></td>
              <td className="numeric">{number(row?.value_base ?? 0)}</td></tr>;
          })}</tbody></table></div>
        <div id="target-editor-container" hidden={!targetOpen} className="target-editor-container">
          {targetOpen && <TargetPlanEditor organization={organization} onChanged={onChanged} onClose={() => setTargetOpen(false)} />}
        </div>
        <p className="table-note category-key">目标合计为 100%。未分组持仓不设目标，也不会分摊到其他分组。</p>
        {hasNegativeCategoryAllocation && <p className="chart-note">负配置按实际数字显示；条形长度无法表示负值。</p>}
      </article>      {/* Secondary: asset allocation, then a deliberately compact broker allocation. Two columns
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
      {managerOpen && <GroupManager organization={organization} onChanged={onChanged} onClose={() => setManagerOpen(false)} />}
  </section>;
}
