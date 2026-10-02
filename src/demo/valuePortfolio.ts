// Values the demo's native facts into a complete Portfolio snapshot.
//
// The page reads it through the PortfolioSource seam and validates it with the same rules as
// any snapshot. The formulas, stated once:
//
//   market value      = quantity × price
//   unrealized P&L    = quantity × (price − average cost)
//   daily P&L         = unavailable (null). One frozen price snapshot has no previous close,
//                       and a day's move is never invented.
//   holding P&L       = unrealized P&L. The invented fixture assumes no sales, so the diluted
//                       cost a broker reports equals the average cost, and the P&L column
//                       reads like a real account.
//   *_base            = native × demoRate(native currency, reporting currency)
//   total             = positions + cash (the demo holds no fund assets)
//   any percentage    = part / total × 100 (0 for a zero total)
//
// Pure: no clock, no storage, no network. The same inputs always give the same snapshot.

import type {
  AllocationAssetType, CashBalance, CategoryAllocation, Portfolio, Position,
} from '../types';
import type { ReportingCurrency } from '../reportingCurrency';
import type { DemoOrganization } from './demoOrganization';
import { DEMO_ACCOUNT, DEMO_AS_OF, DEMO_CASH_USD, DEMO_HOLDINGS } from './mockPortfolio';
import { demoFxRates, demoRate } from './mockFx';


const NATIVE_CURRENCY = 'USD';

/** No meaningful share of a negative base, 0% of a zero one. */
function percentage(part: number, whole: number): number | null {
  if (whole < 0) return null;
  if (whole === 0) return 0;
  return part / whole * 100;
}

export type DemoValuationMeta = { generation: number; instanceId: string };

export function valuePortfolio(
  currency: ReportingCurrency,
  organization: DemoOrganization,
  { generation, instanceId }: DemoValuationMeta,
): Portfolio {
  const rate = demoRate(NATIVE_CURRENCY, currency);

  const positions: Position[] = DEMO_HOLDINGS.map(holding => {
    const value = holding.quantity * holding.price;
    const unrealized = holding.quantity * (holding.price - holding.average_cost);
    const cost = holding.quantity * holding.average_cost;
    return {
      id: `demo-${holding.symbol}`,
      broker: DEMO_ACCOUNT.broker,
      account_id: DEMO_ACCOUNT.id,
      symbol: holding.symbol,
      name: holding.name,
      market: 'US',
      asset_type: holding.asset_type,
      currency: NATIVE_CURRENCY,
      quantity: holding.quantity,
      average_cost_native: holding.average_cost,
      current_price_native: holding.price,
      previous_close_native: null,
      market_value_native: value,
      fx_rate_to_base: rate,
      market_value_base: value * rate,
      unrealized_pnl_native: unrealized,
      unrealized_pnl_base: unrealized * rate,
      daily_pnl_native: null,
      daily_pnl_base: null,
      holding_pnl_native: unrealized,
      holding_pnl_pct: cost === 0 ? null : unrealized / cost * 100,
      holding_pnl_base: unrealized * rate,
      category: organization.groups.find(group => group.id === (organization.assignments[holding.symbol] ?? null))?.name ?? 'Unclassified',
      classification_state: (organization.assignments[holding.symbol] ?? null) === null ? 'unassigned' : 'assigned',
      allocation_group_id: organization.assignments[holding.symbol] ?? null,
      broker_key: 'demo',
      option_details: null,
      broker_metrics: null,
    };
  });

  const cashBalances: CashBalance[] = [{
    id: 'demo-cash-usd', broker: DEMO_ACCOUNT.broker, account_id: DEMO_ACCOUNT.id,
    currency: NATIVE_CURRENCY, amount_native: DEMO_CASH_USD, fx_rate_to_base: rate,
    amount_base: DEMO_CASH_USD * rate, category: 'Cash',
  }];

  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const positionsTotal = sum(positions.map(position => position.market_value_base));
  const cashTotal = sum(cashBalances.map(cash => cash.amount_base));
  const total = positionsTotal + cashTotal;
  const unrealizedTotal = sum(positions.map(position => position.unrealized_pnl_base ?? 0));
  const holdingTotal = sum(positions.map(position => position.holding_pnl_base ?? 0));

  const valueOfGroup = (id: string) => sum(positions.filter(position => position.allocation_group_id === id)
    .map(position => position.market_value_base));
  const categoryAllocation: CategoryAllocation[] = organization.groups.map(group => {
    const value = valueOfGroup(group.id);
    const actual = percentage(value, total);
    const target = organization.targets[group.id];
    return { category: group.name, target_pct: target, actual_pct: actual, value_base: value,
      gap_pct: actual === null ? null : actual - target };
  });
  categoryAllocation.push({ category: 'Cash', target_pct: organization.cashTarget,
    actual_pct: percentage(cashTotal, total), value_base: cashTotal,
    gap_pct: percentage(cashTotal, total)! - organization.cashTarget });
  const ungrouped = sum(positions.filter(position => position.allocation_group_id === null)
    .map(position => position.market_value_base));
  if (ungrouped !== 0) categoryAllocation.push({ category: 'Unclassified', target_pct: null,
    actual_pct: percentage(ungrouped, total), value_base: ungrouped, gap_pct: null });
  const assetValues: [AllocationAssetType, number][] = [
    ...(['Equity', 'ETF', 'Option'] as const).map((type): [AllocationAssetType, number] =>
      [type, sum(positions.filter(position => position.asset_type === type)
        .map(position => position.market_value_base))]),
    ['Cash', cashTotal],
  ];

  const nativePositions = sum(positions.map(position => position.market_value_native));
  const nativeCash = sum(cashBalances.map(cash => cash.amount_native));

  return {
    mode: 'mock',
    base_currency: currency,
    as_of: DEMO_AS_OF,
    accounts: [{ ...DEMO_ACCOUNT }],
    positions,
    cash_balances: cashBalances,
    fund_assets: null,
    fx_rates: demoFxRates(currency),
    summary: {
      total_value_base: total,
      positions_value_base: positionsTotal,
      cash_value_base: cashTotal,
      fund_assets_value_base: 0,
      cash_ratio_pct: percentage(cashTotal, total),
      // Unavailable in every position, so unavailable in total — never a partial sum or a 0.
      daily_pnl_base: null,
      daily_pnl_pct: null,
      unrealized_pnl_base: unrealizedTotal,
      total_holding_pnl_base: holdingTotal,
    },
    broker_allocation: [{
      broker: DEMO_ACCOUNT.broker, account_count: 1, value_base: total, weight_pct: percentage(total, total),
    }],
    asset_allocation: assetValues.map(([asset_type, value]) =>
      ({ asset_type, value_base: value, weight_pct: percentage(value, total) })),
    category_allocation: categoryAllocation,
    organization,
    native_totals: [{
      currency: NATIVE_CURRENCY, positions_value_native: nativePositions,
      cash_value_native: nativeCash, total_value_native: nativePositions + nativeCash,
    }],
    // The demo is read from no broker, so it reports no broker health at all — never a fake
    // connection and never a fake warning.
    broker_status: [],
    native_generation: generation,
    native_instance_id: instanceId,
  };
}
