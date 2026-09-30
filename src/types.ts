// Currency is an open string (Position.currency, CashBalance.currency,
// FXRate.currency/base_currency), so this stays a plain alias rather than a closed union: 'USD' | 'SGD' | 'HKD' | 'CNY' | 'CNH' are the currencies
// currently seen, but an unlisted one must still render, not fail to type-check.
export type Currency = string;

// The demo always reports 'mock'; the other modes are part of the snapshot shape only.
export type PortfolioMode = 'mock' | 'moomoo' | 'tiger' | 'webull' | 'multi';
export type AccountType = 'mock' | 'real';
// 'Security' is the neutral type for a broker row whose stock-vs-ETF status is unreported.
export type AssetType = 'Equity' | 'ETF' | 'Option' | 'Security';
export type AllocationAssetType = AssetType | 'Cash' | 'Fund Assets';
export type PositionCategory = 'Core' | 'Mid' | 'High Beta' | 'Bonds' | 'Unclassified';
// Why a position carries its category. Additive: `category` is unchanged, so a
// snapshot that omits this (such as a test fixture) still renders, and the UI infers the
// safe default. 'unassigned' is never inferred: it needs a real mapping.
//   assigned             -> a real portfolio role
//   unassigned           -> the user mapped it explicitly to unclassified (a decision)
//   needs_classification -> no mapping entry matched it (an action item)
export type ClassificationState = 'assigned' | 'needs_classification' | 'unassigned';
// The CANONICAL broker scope key a classification mapping is addressed to. It is reported on
// every Position by the source, so the frontend round-trips it and never maps a display string
// itself. Part of the snapshot shape only: the demo never reports one.
export type BrokerKey = 'moomoo' | 'tiger' | 'webull' | 'usmart';
// The scope a classification edit is addressed to. The demo (src/demo/) uses its own 'demo'
// scope for its fabricated rows; it is deliberately NOT a BrokerKey, so a BrokerStatus can
// never name it.
export type ClassificationScope = BrokerKey | 'demo';
// 'Fund Assets' is a non-target aggregate bucket: neither a position category nor Cash.
export type AllocationCategory = 'Core' | 'Mid' | 'High Beta' | 'Bonds' | 'Cash' | 'Unclassified' | 'Fund Assets';
export type OptionRight = 'CALL' | 'PUT';

export interface Account {
  id: string;
  broker: string;
  name: string;
  account_type: AccountType;
  // Unknown for a real account until a verified per-account source exists.
  base_currency: Currency | null;
}

export interface OptionDetails {
  underlying: string | null;
  option_type: OptionRight | null;
  strike: number | null;
  expiry: string | null;
  contract_multiplier: number | null;
  metadata_source: string | null;
}

// Distinct broker-reported metrics; never substituted for the unified P&L fields above.
// pl_val/pl_ratio (diluted-cost "position P&L") and unrealized_pl/pl_ratio_avg_cost
// (average-cost "unrealized P&L") are distinct accounting presentations and are
// never substituted for each other. realized_pl is metadata only; no UI yet.
export interface BrokerPositionMetrics {
  source: string;
  cost_price: number | null;
  diluted_cost: number | null;
  unrealized_pl: number | null;
  pl_val: number | null;
  today_pl_val: number | null;
  pl_ratio: number | null;
  pl_ratio_avg_cost: number | null;
  realized_pl: number | null;
  // Broker-specific variants (metadata only; the unified field uses unrealized_pl).
  unrealized_pl_broker_default?: number | null;
  unrealized_pl_cost_of_carry?: number | null;
}

export interface Position {
  id: string;
  broker: string;
  account_id: string;
  symbol: string;
  name: string;
  market: string;
  asset_type: AssetType;
  currency: Currency;
  // Signed shares for equities/ETFs, signed contracts for options.
  quantity: number;
  average_cost_native: number | null;
  current_price_native: number | null;
  previous_close_native: number | null;
  // Always present and authoritative; never recalculated from quantity * price here.
  market_value_native: number;
  fx_rate_to_base: number;
  market_value_base: number;
  unrealized_pnl_native: number | null;
  unrealized_pnl_base: number | null;
  daily_pnl_native: number | null;
  daily_pnl_base: number | null;
  // Diluted-cost "position P&L" (持仓盈亏/持仓盈亏率) — distinct from
  // unrealized_pnl_* (average-cost "unrealized P&L", 未实现盈亏) above; never
  // substituted for it. holding_pnl_base is holding_pnl_native after the service's
  // single FX conversion; null when the broker reports no native holding P&L.
  // holding_pnl_pct is a dimensionless percentage.
  holding_pnl_native: number | null;
  holding_pnl_pct: number | null;
  holding_pnl_base: number | null;
  category: PositionCategory;
  // Optional so existing/older snapshots stay valid; absent degrades via category alone.
  classification_state?: ClassificationState;
  // Canonical broker key for a classification write. Optional for the same reason as the
  // field above: a snapshot may omit it, and a row without it renders its classification READ-ONLY rather than the frontend
  // inventing a broker identity from display text.
  broker_key?: ClassificationScope;
  option_details: OptionDetails | null;
  broker_metrics: BrokerPositionMetrics | null;
}

export interface CashBalance {
  id: string;
  broker: string;
  account_id: string;
  currency: Currency;
  amount_native: number;
  fx_rate_to_base: number;
  amount_base: number;
  category: 'Cash';
}

export interface FXRate {
  currency: Currency;
  base_currency: Currency;
  rate: number;
  as_of: string;
  // 'mock': a fixed synthetic rate (every demo rate). 'identity': same-currency 1 with no source.
  source: 'mock' | 'identity';
}

// Broker-reported AGGREGATE fund net asset value: not cash, not a position, not Cash Plus detail.
export interface FundAssets {
  id: string;
  broker: string;
  account_id: string;
  currency: Currency;
  amount_native: number;
  fx_rate_to_base: number;
  amount_base: number;
  category: 'Fund Assets';
}

export interface PortfolioSummary {
  total_value_base: number;
  positions_value_base: number;
  cash_value_base: number;
  // Aggregate broker Fund Assets included in the total exactly once (0 when none reported).
  fund_assets_value_base?: number;
  cash_ratio_pct: number | null;
  daily_pnl_base: number | null;
  daily_pnl_pct: number | null;
  unrealized_pnl_base: number | null;
  // Sum of all position holding_pnl_base values; null when any position's
  // holding_pnl_native is unavailable — never a partial sum, never fabricated 0.
  total_holding_pnl_base: number | null;
}

export interface BrokerAllocation {
  broker: string;
  account_count: number;
  value_base: number;
  weight_pct: number | null;
}

export interface AssetAllocation {
  asset_type: AllocationAssetType;
  value_base: number;
  weight_pct: number | null;
}

export interface CategoryAllocation {
  category: AllocationCategory;
  // Unavailable (not invented) for the Unclassified bucket.
  target_pct: number | null;
  actual_pct: number | null;
  value_base: number;
  gap_pct: number | null;
}

// Whether ONE broker contributed to a snapshot.
//   ok          -> read completely; its accounts, positions, cash and fund assets are all in
//                  this snapshot and in its totals.
//   unavailable -> its acquisition failed, so NOTHING of it is here: no account, no position,
//                  no cash, no fund assets and no share of any total or allocation. It is
//                  excluded, never estimated and never a stale carried-over value.
// `detail` is the source's own sanitized message (no account id, symbol, quantity, balance,
// payload, credential or path) and is null for a healthy broker.
export interface BrokerStatus {
  broker_key: BrokerKey;
  // The display name. REQUIRED and non-empty, so a status that cannot name its broker is
  // refused rather than accepted nameless.
  broker: string;
  status: 'ok' | 'unavailable';
  detail?: string | null;
  // WHICH KIND of failure, for a consumer that must reproduce the status code the broker
  // would have returned alone. 'connection' is the 502 family (a retry may help);
  // 'account_selection' is the 422 family (a local setting must change). Null when healthy.
  // The dashboard does not branch on it today; it is reported so it never has to guess.
  reason?: 'connection' | 'account_selection' | null;
  // A broker that IS included, whose data carries a stated uncertainty.
  //
  // Deliberately NOT a third `status`: this broker's rows are in the snapshot and every total
  // counts them, so "is anything missing?" is still answered by `status` alone and nothing may
  // read this as an exclusion.
  //
  //   valuation_consistency -> the broker's own aggregate market value did not agree with the
  //                            positions it returned. The positions remain the authoritative
  //                            valuation; the aggregate is a cross-check and is never a total.
  //   valuation_unverified  -> that cross-check could not be performed, because the aggregate
  //                            was absent or unparseable.
  //
  // A typed code and nothing else: no amount, difference, percentage, symbol or identifier.
  warning?: 'valuation_consistency' | 'valuation_unverified' | null;
}

// A denomination total: positions and cash summed within their own shared native
// currency, with no FX conversion. This describes how holdings are denominated,
// not economic FX/currency risk exposure.
export interface NativeCurrencyTotal {
  currency: Currency;
  positions_value_native: number;
  cash_value_native: number;
  total_value_native: number;
}

export interface Portfolio {
  mode: PortfolioMode;
  base_currency: Currency;
  as_of: string;
  accounts: Account[];
  positions: Position[];
  cash_balances: CashBalance[];
  fund_assets?: FundAssets | null;
  fx_rates: FXRate[];
  summary: PortfolioSummary;
  broker_allocation: BrokerAllocation[];
  asset_allocation: AssetAllocation[];
  category_allocation: CategoryAllocation[];
  native_totals: NativeCurrencyTotal[];
  // PER-BROKER HEALTH for this snapshot: one entry per broker the source reads, healthy or not.
  // Every accounting field above describes the `ok` brokers alone.
  //
  // OPTIONAL on purpose, unlike the freshness fields below: a source that does not report
  // broker health excludes no broker, so its totals are complete. The demo reports an empty
  // list, because it reads from no broker at all.
  broker_status?: BrokerStatus[];
  // WHICH authoritative set of holdings this response was valued from. A bare monotonic
  // integer: it increases only when a successful fresh read becomes the source's authoritative
  // holdings, every revaluation reports the generation it was built FROM unchanged, and 0 means
  // a read that completed but lost the source's ordering race. It carries no account, symbol,
  // amount, timestamp or path.
  //
  // It exists because response ORDER is not freshness: without it the page cannot tell that a
  // late revaluation was built from OLDER holdings than the ones on screen.
  //
  // REQUIRED: freshness metadata that can go missing is not a guarantee, so a response without
  // it is refused and the known-good snapshot is kept. The demo's is a fixed, non-zero 1.
  native_generation: number;
  // WHICH source instance minted that generation. Generations are only comparable within one
  // instance: the counter restarts at 1 when the source restarts, so without this a dashboard
  // showing generation 12 from a previous instance would reject every response from the new one
  // as older and could never recover. Non-sensitive: it names an instance and nothing else.
  native_instance_id: string;
}
