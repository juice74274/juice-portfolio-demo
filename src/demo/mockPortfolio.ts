// Entirely fabricated, frozen USD portfolio for the public demo. No market feed or private data.
import type { Account, AssetType } from '../types';

export const DEMO_PRICE_SNAPSHOT = { date: '2026-10-01', basis: 'synthetic demonstration prices' } as const;
export const DEMO_AS_OF = '2026-10-01T20:00:00Z';
export const DEMO_BROKER = 'Demo';
export const DEMO_ACCOUNT: Account = {
  id: 'demo-account', broker: DEMO_BROKER, name: 'Demo Portfolio',
  account_type: 'mock', base_currency: 'USD',
};
export type DemoHolding = {
  symbol: string; name: string; asset_type: AssetType;
  quantity: number; average_cost: number; price: number; groupId: string;
};

// Price × quantity gives group totals of 145k / 165k / 95k / 50k.
// Quantities, costs, prices, and P&L are invented together for this fixture.
export const DEMO_HOLDINGS: readonly DemoHolding[] = [
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', asset_type: 'ETF', quantity: 200, average_cost: 450, price: 500, groupId: 'index' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', asset_type: 'ETF', quantity: 100, average_cost: 400, price: 450, groupId: 'index' },
  { symbol: 'MSFT', name: 'Microsoft', asset_type: 'Equity', quantity: 100, average_cost: 450, price: 500, groupId: 'core' },
  { symbol: 'AAPL', name: 'Apple', asset_type: 'Equity', quantity: 200, average_cost: 225, price: 250, groupId: 'core' },
  { symbol: 'GOOGL', name: 'Alphabet Class A', asset_type: 'Equity', quantity: 200, average_cost: 180, price: 200, groupId: 'core' },
  { symbol: 'NVDA', name: 'NVIDIA', asset_type: 'Equity', quantity: 125, average_cost: 180, price: 200, groupId: 'core' },
  { symbol: 'BRK.B', name: 'Berkshire Hathaway Class B', asset_type: 'Equity', quantity: 50, average_cost: 470, price: 500, groupId: 'defensive' },
  { symbol: 'SCHD', name: 'Schwab U.S. Dividend Equity ETF', asset_type: 'ETF', quantity: 500, average_cost: 28, price: 30, groupId: 'defensive' },
  { symbol: 'WMT', name: 'Walmart', asset_type: 'Equity', quantity: 500, average_cost: 90, price: 100, groupId: 'defensive' },
  { symbol: 'KO', name: 'Coca-Cola', asset_type: 'Equity', quantity: 100, average_cost: 55, price: 50, groupId: 'defensive' },
  { symbol: 'PLTR', name: 'Palantir Technologies', asset_type: 'Equity', quantity: 150, average_cost: 80, price: 100, groupId: 'satellite' },
  { symbol: 'HOOD', name: 'Robinhood Markets', asset_type: 'Equity', quantity: 200, average_cost: 110, price: 100, groupId: 'satellite' },
  { symbol: 'RKLB', name: 'Rocket Lab', asset_type: 'Equity', quantity: 250, average_cost: 70, price: 60, groupId: 'satellite' },
];
export const DEMO_CASH_USD = 45_000;
export const DEMO_INITIAL_CAPITAL_USD = DEMO_HOLDINGS.reduce(
  (sum, holding) => sum + holding.quantity * holding.average_cost, DEMO_CASH_USD,
);
