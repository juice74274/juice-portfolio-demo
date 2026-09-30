import type { Account, Position } from '../types';
import {
  assetTypeLabel, classificationOptionLabel, needsClassificationLabel, normalizeCategory,
  normalizeClassificationState, positionCategoryLabel,
} from '../labels';
import {
  CLASSIFICATION_CATEGORY_KEYS, NEEDS_CLASSIFICATION_VALUE, isCategoryKey, isEditable,
  selectedCategoryKey, type ClassificationCategoryKey,
} from '../classification';
import { nativeAmount, quantityFormat, signedPercent, tone } from '../format';
import { logoSymbolFor } from '../holdingLogos';
import { HoldingLogo } from './HoldingLogo';
import { Icon } from './Icon';
import { PositionDetails } from './PositionDetails';

// A native amount with its repeated currency code set apart, so the code can recede behind
// the figure. The text content is exactly nativeAmount()'s ("USD 550.00"); "—" stays a dash.
function NativeAmount({ text, currency }: { text: string; currency: string }) {
  const prefix = `${currency} `;
  if (!text.startsWith(prefix)) return <>{text}</>;
  return <><span className="amount-code">{currency}</span>{' '}{text.slice(prefix.length)}</>;
}

// One position: its main row plus, when open, the detail row beneath it. These are two
// sibling <tr> elements in the same <tbody>, so the component returns a fragment and
// adds no wrapper element of its own — the table markup is unchanged.
export function PositionRow({ position, accounts, isExpanded, onToggle, saving, onClassify }: {
  position: Position;
  accounts: Account[];
  isExpanded: boolean;
  onToggle: () => void;
  // This row's classification mapping is being written right now, so its
  // selector is disabled. It is per mapping, not global: the rest of the page stays usable.
  saving: boolean;
  // Absent when editing is unavailable, which keeps the read-only tag for a snapshot that
  // supplied no canonical broker key.
  onClassify?: (position: Position, category: ClassificationCategoryKey) => void;
}) {
  const category = normalizeCategory(position.category);
  const state = normalizeClassificationState(position.classification_state, position.category);
  // The CSS hooks are unchanged from the read-only tag, so the category colour and the
  // dashed "needs classification" treatment apply to the selector exactly as before.
  const classificationClasses =
    `category-${category.toLowerCase().replaceAll(' ', '-')} state-${state}`;
  const editable = isEditable(position) && onClassify !== undefined;
  // Computed once and used for BOTH the selected value and whether the placeholder option
  // exists, so the control can never be asked to select an option it does not render — a
  // native <select> would quietly "fix" that by selecting its first option, i.e. by
  // displaying a category the snapshot never reported.
  const selected = selectedCategoryKey(position.category, state);

  return <>
    <tr className={isExpanded ? 'expanded-row' : ''}>
      <th scope="row"><div className="asset-identity"><HoldingLogo symbol={logoSymbolFor(position)} /><div><strong>{position.symbol}</strong><span>{position.broker}</span></div></div></th>
      <td><div className="type-category-stack">
        <span className={`asset-type-tag asset-type-${position.asset_type.toLowerCase()}`}>{assetTypeLabel(position.asset_type)}</span>
        {/* Presentational only: carries the "·" separator so it wraps with the classification
            rather than being left behind at the end of the asset-type line. */}
        <span className="classification-meta">{editable
          // The selector IS the classification display: its selected option shows the same
          // wording the read-only tag used, so nothing is hidden behind an edit affordance.
          // A position with no mapping entry shows an unselectable placeholder rather than
          // a pre-picked bucket, because "needs classification" is the ABSENCE of a mapping
          // and is not a value that could be written back.
          ? <select className={`category-select ${classificationClasses}`}
              aria-label={`设置 ${position.symbol}（${position.broker}）的分类`}
              title={category}
              value={selected}
              disabled={saving}
              data-saving={saving ? 'true' : undefined}
              data-broker-key={position.broker_key}
              onChange={event => {
                const chosen = event.target.value;
                // Guard rather than cast: the placeholder is not a writable category, and
                // an unexpected value is never forwarded to the write API.
                if (isCategoryKey(chosen)) onClassify(position, chosen);
              }}>
              {selected === NEEDS_CLASSIFICATION_VALUE &&
                <option value={NEEDS_CLASSIFICATION_VALUE} disabled>{needsClassificationLabel()}</option>}
              {CLASSIFICATION_CATEGORY_KEYS.map(key =>
                <option key={key} value={key}>{classificationOptionLabel(key)}</option>)}
            </select>
          : <span className={`category-tag ${classificationClasses}`} title={category}>{positionCategoryLabel(position.category, position.classification_state)}</span>}</span>
      </div></td>
      <td className="numeric numeric-secondary">{quantityFormat.format(position.quantity)}</td>
      <td className="numeric numeric-secondary"><NativeAmount text={nativeAmount(position.current_price_native, position.currency)} currency={position.currency} /></td>
      {/* Signed exposure is not a P&L loss; no P&L color on market value. */}
      <td className="numeric base-value"><NativeAmount text={nativeAmount(position.market_value_native, position.currency)} currency={position.currency} /></td>
      {/* Unrealized P&L is the portfolio-level headline metric, so the main row
          carries its native per-position counterpart; daily P&L stays native in
          the detail panel because it is unavailable at some brokers. */}
      <td className={`numeric ${tone(position.unrealized_pnl_native)}`}><NativeAmount text={nativeAmount(position.unrealized_pnl_native, position.currency, true)} currency={position.currency} /></td>
      <td className={`numeric ${tone(position.holding_pnl_native)}`}><NativeAmount text={nativeAmount(position.holding_pnl_native, position.currency, true)} currency={position.currency} /></td>
      <td className={`numeric ${tone(position.holding_pnl_pct)}`}>{signedPercent(position.holding_pnl_pct)}</td>
      <td><button className={`expand-button ${isExpanded ? 'is-open' : ''}`} aria-label={`${isExpanded ? '收起' : '展开'} ${position.symbol} ${position.broker} 明细`} aria-expanded={isExpanded} aria-controls={`detail-${position.id}`} onClick={onToggle}><Icon name="chevron" /></button></td>
    </tr>
    {isExpanded && <tr id={`detail-${position.id}`} className="details-row"><td colSpan={9}><div className="details-title">{position.name}<span>{assetTypeLabel(position.asset_type)}</span></div><PositionDetails position={position} accounts={accounts} /></td></tr>}
  </>;
}
