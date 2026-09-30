import type { Account, OptionDetails, Position } from '../types';
import { optionRightLabel } from '../labels';
import { UNAVAILABLE, isFiniteNumber, number, quantityFormat, signed, text, tone } from '../format';

// Never the raw account ID: Account.name is a non-sensitive display label ("Demo Portfolio").
function accountLabel(accountId: string, accounts: Account[]) {
  return accounts.find(account => account.id === accountId)?.name ?? '账户';
}

// Kept beside its only caller rather than given a file of its own.
function OptionMetadata({ details, currency }: { details: OptionDetails; currency: string }) {
  return <>
    <div><span>标的 · Underlying</span><strong>{text(details.underlying)}</strong></div>
    <div><span>方向 · Type</span><strong>{details.option_type ? optionRightLabel(details.option_type) : UNAVAILABLE}</strong></div>
    <div><span>行权价 Strike · {currency}</span><strong>{number(details.strike)}</strong></div>
    <div><span>到期日 · Expiry</span><strong>{text(details.expiry)}</strong></div>
    <div><span>合约乘数 · Multiplier</span><strong>{isFiniteNumber(details.contract_multiplier) ? quantityFormat.format(details.contract_multiplier) : UNAVAILABLE}</strong></div>
  </>;
}

// Position-level detail is native-currency only: prices, market value and P&L belong to the
// position's own currency, and the reporting-currency (*_base) conversions are deliberately not
// repeated here. They remain in the snapshot and drive the portfolio-level totals. Only fields
// the main row does not already show appear here, so nothing is duplicated and nothing
// unavailable is invented.
export function PositionDetails({ position, accounts }: { position: Position; accounts: Account[] }) {
  return <div className="position-details">
    <div><span>平均成本 · {position.currency}</span><strong>{number(position.average_cost_native)}</strong></div>
    <div><span>前收盘价 · {position.currency}</span><strong>{number(position.previous_close_native)}</strong></div>
    {/* Daily P&L stays available per position in its native currency; it is no longer a
        portfolio-level headline because it is incomplete across brokers. */}
    <div><span>当日盈亏 · {position.currency}</span><strong className={tone(position.daily_pnl_native)}>{signed(position.daily_pnl_native)}</strong></div>
    <div><span>账户 / 市场</span><strong>{accountLabel(position.account_id, accounts)} / {position.market}</strong></div>
    {position.option_details && <OptionMetadata details={position.option_details} currency={position.currency} />}
  </div>;
}
