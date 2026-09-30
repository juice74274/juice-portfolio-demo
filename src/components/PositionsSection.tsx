import { useMemo } from 'react';
import type { Portfolio, Position } from '../types';
import { assetTypeLabel, normalizeCategory, normalizeClassificationState, positionCategoryLabel } from '../labels';
import { positionClassificationKey, type ClassificationCategoryKey } from '../classification';
import { Icon } from './Icon';
import { PositionRow } from './PositionRow';

// The search/filter/expanded state stays in the shell; this section derives from it.
// Both derivations below are consumed only here.
export function PositionsSection({ portfolio, baseCurrency, search, onSearchChange, broker, onBrokerChange, expanded, onToggleExpanded, onClearFilters, savingClassifications, onClassify, notice, onDismissNotice }: {
  portfolio: Portfolio;
  baseCurrency: string;
  search: string;
  onSearchChange: (value: string) => void;
  broker: string;
  onBrokerChange: (value: string) => void;
  expanded: string | null;
  onToggleExpanded: (id: string) => void;
  onClearFilters: () => void;
  // Every broker+symbol mapping currently being written, as a set of mapping keys (saves for
  // DIFFERENT mappings run concurrently). Membership is tested per ROW, so when one
  // broker+symbol appears under several accounts every matching row disables together —
  // which is honest, because one write does change all of them — while unrelated rows stay
  // enabled AND stay functional.
  savingClassifications: ReadonlySet<string>;
  // Absent when the source says classification is not writable. PositionRow then renders the
  // read-only tag, exactly as it does for a row with no broker_key.
  onClassify?: (position: Position, category: ClassificationCategoryKey) => void;
  // One short, dismissible, sanitized line about the LAST thing that did not work, shown
  // here rather than in the overview banner because the snapshot on screen is still valid.
  //
  // Two things can produce it, and both are presentation problems rather than snapshot
  // failures: a classification write or its authoritative re-read failing, and a successful
  // Refresh whose holdings could not be presented. The shell keeps them in one channel so a
  // newer authoritative snapshot clears whichever was showing.
  notice: string;
  onDismissNotice: () => void;
}) {
  const filteredPositions = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return portfolio.positions.filter(position =>
      (broker === 'all' || position.broker === broker) &&
      (!term || `${position.symbol} ${position.name} ${position.broker} ${normalizeCategory(position.category)} ${positionCategoryLabel(position.category, position.classification_state)} ${position.currency} ${assetTypeLabel(position.asset_type)}`.toLocaleLowerCase().includes(term)),
    );
  }, [portfolio, search, broker]);
  // Counts only: how many held positions have no mapping entry. Never lists symbols.
  const needsClassificationCount = useMemo(
    () => portfolio.positions.filter(position =>
      normalizeClassificationState(position.classification_state, position.category) === 'needs_classification').length,
    [portfolio],
  );

  // A row is disabled only while ITS OWN mapping is being written. Two rows for one
  // broker+symbol share a key and so disable together; every other row stays interactive.
  const savingRow = (position: Position) => {
    const key = positionClassificationKey(position);
    return key !== null && savingClassifications.has(key);
  };

  return <section id="positions" aria-labelledby="positions-title">
    <div className="section-heading"><h2 id="positions-title">持仓明细 <span className="count-pill">{portfolio.positions.length}</span>{needsClassificationCount > 0 && <span className="count-pill needs-classification-pill" title="持仓中尚无分类映射的数量">待分类 {needsClassificationCount}</span>}</h2><span>POSITIONS</span></div>
    <article className="card positions-card">
      <div className="positions-toolbar">
        <div><h3>持仓列表</h3></div>
        <div className="filters">
          <label className="search-field"><Icon name="search" /><input type="search" aria-label="搜索持仓" placeholder="搜索持仓…" value={search} onChange={event => onSearchChange(event.target.value)} /></label>
          <select aria-label="筛选券商" value={broker} onChange={event => onBrokerChange(event.target.value)}><option value="all">全部券商</option>{portfolio.broker_allocation.map(item => <option key={item.broker} value={item.broker}>{item.broker}</option>)}</select>
        </div>
        {/* The general methodology note sits behind the same 数据说明 disclosure as the
            overview and allocation. It states native-currency display, and that a
            classification edit is a LOCAL setting that changes no amount. */}
        <details className="block-method" data-testid="positions-method">
          <summary><Icon name="info" /><span>数据说明</span></summary>
          <div className="block-method-body">
            <p className="table-note">金额一律按各持仓原币显示，不折算为 {baseCurrency}；市值 = 数量 × 价格。分类可直接在“类型 / 分类”列修改，不改变数量、市值或盈亏。分类设置仅保存在当前浏览器。</p>
          </div>
        </details>
      </div>
      <div className="table-scroll"><table className="positions-table">
        <thead><tr>
          <th scope="col">资产 / 券商</th><th scope="col">类型 / 分类</th><th scope="col" className="numeric">数量</th>
          <th scope="col" className="numeric">当前价格 · 原币</th><th scope="col" className="numeric">市值 · 原币</th>
          <th scope="col" className="numeric">未实现盈亏 · 原币</th><th scope="col" className="numeric">持仓盈亏 · 原币</th>
          <th scope="col" className="numeric">持仓盈亏率</th><th scope="col"><span className="sr-only">明细</span></th>
        </tr></thead>
        <tbody>
          {filteredPositions.length === 0 && <tr><td colSpan={9}><div className="empty-state"><Icon name="search" /><strong>{portfolio.positions.length ? '未找到匹配持仓' : '暂无持仓'}</strong><span>{portfolio.positions.length ? '请尝试其他关键词或券商筛选。' : '快照包含持仓后将在此显示。'}</span>{(search || broker !== 'all') && <button className="text-button" onClick={onClearFilters}>清除筛选</button>}</div></td></tr>}
          {filteredPositions.map(position =>
            <PositionRow key={position.id} position={position} accounts={portfolio.accounts}
              isExpanded={expanded === position.id} onToggle={() => onToggleExpanded(position.id)}
              saving={savingRow(position)}
              onClassify={onClassify} />)}
        </tbody>
      </table></div>
      {notice && <p className="classification-error" role="status">
        <Icon name="shield" /><span>{notice}</span>
        <button className="text-button" onClick={onDismissNotice}>关闭</button>
      </p>}
      <div className="positions-footer"><span>显示 {filteredPositions.length} / {portfolio.positions.length} 项持仓</span><span>展开查看成本、前收盘价与当日盈亏（原币）</span></div>
    </article>
  </section>;
}
