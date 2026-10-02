import type { Account, Position } from '../types';
import type { DemoGroup } from '../demo/demoOrganization';
import { assetTypeLabel } from '../labels';
import { isEditable } from '../classification';
import { nativeAmount, quantityFormat, signedPercent, tone } from '../format';
import { logoSymbolFor } from '../holdingLogos';
import { HoldingLogo } from './HoldingLogo';
import { Icon } from './Icon';
import { PositionDetails } from './PositionDetails';

function NativeAmount({ text, currency }: { text: string; currency: string }) {
  const prefix = `${currency} `;
  if (!text.startsWith(prefix)) return <>{text}</>;
  return <><span className="amount-code">{currency}</span>{' '}{text.slice(prefix.length)}</>;
}
export function PositionRow({ position, accounts, groups, isExpanded, onToggle, saving, onClassify }: {
  position: Position; accounts: Account[]; groups: DemoGroup[]; isExpanded: boolean;
  onToggle: () => void; saving: boolean; onClassify?: (position: Position, groupId: string) => void;
}) {
  const editable = isEditable(position) && onClassify !== undefined;
  const selected = position.allocation_group_id ?? 'unclassified';
  return <>
    <tr className={isExpanded ? 'expanded-row' : ''}>
      <th scope="row"><div className="asset-identity"><HoldingLogo symbol={logoSymbolFor(position)} /><div><strong>{position.symbol}</strong><span>{position.broker}</span></div></div></th>
      <td><div className="type-category-stack">
        <span className={`asset-type-tag asset-type-${position.asset_type.toLowerCase()}`}>{assetTypeLabel(position.asset_type)}</span>
        <span className="classification-meta">{editable
          ? <select className="category-select" aria-label={`设置 ${position.symbol} 的分组`} value={selected}
              disabled={saving} data-saving={saving ? 'true' : undefined} data-broker-key={position.broker_key}
              onChange={event => { const id = event.target.value; if (id === 'unclassified' || groups.some(group => group.id === id)) onClassify(position, id); }}>
              {groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
              <option value="unclassified">未分组 / Ungrouped</option>
            </select>
          : <span className="category-tag">{position.category}</span>}</span>
      </div></td>
      <td className="numeric numeric-secondary">{quantityFormat.format(position.quantity)}</td>
      <td className="numeric numeric-secondary"><NativeAmount text={nativeAmount(position.current_price_native, position.currency)} currency={position.currency} /></td>
      <td className="numeric base-value"><NativeAmount text={nativeAmount(position.market_value_native, position.currency)} currency={position.currency} /></td>
      <td className={`numeric ${tone(position.unrealized_pnl_native)}`}><NativeAmount text={nativeAmount(position.unrealized_pnl_native, position.currency, true)} currency={position.currency} /></td>
      <td className={`numeric ${tone(position.holding_pnl_native)}`}><NativeAmount text={nativeAmount(position.holding_pnl_native, position.currency, true)} currency={position.currency} /></td>
      <td className={`numeric ${tone(position.holding_pnl_pct)}`}>{signedPercent(position.holding_pnl_pct)}</td>
      <td><button className={`expand-button ${isExpanded ? 'is-open' : ''}`} aria-label={`${isExpanded ? '收起' : '展开'} ${position.symbol} ${position.broker} 明细`}
        aria-expanded={isExpanded} aria-controls={`detail-${position.id}`} onClick={onToggle}><Icon name="chevron" /></button></td>
    </tr>
    {isExpanded && <tr id={`detail-${position.id}`} className="details-row"><td colSpan={9}><div className="details-title">{position.name}<span>{assetTypeLabel(position.asset_type)}</span></div><PositionDetails position={position} accounts={accounts} /></td></tr>}
  </>;
}
