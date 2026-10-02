import { expect, test } from '@playwright/test';
import type { Portfolio } from '../../src/types';
import { DEMO_DEFAULT_GOAL, demoPortfolioSource } from '../../src/demo/demoPortfolioSource';
import { DEMO_CASH_USD, DEMO_HOLDINGS, DEMO_INITIAL_CAPITAL_USD } from '../../src/demo/mockPortfolio';
import { DEMO_FX_PER_USD, demoRate } from '../../src/demo/mockFx';
import { assignDemoHolding, createDemoGroup, DEFAULT_GROUPS, deleteDemoGroup, readDemoOrganization, renameDemoGroup, saveDemoTargets } from '../../src/demo/demoOrganization';

const storage = new Map<string, string>();
Object.assign(globalThis, { window: { localStorage: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
  removeItem: (key: string) => { storage.delete(key); },
} } });
const originalFetch = globalThis.fetch;
let fetchCalls = 0;
test.beforeEach(() => {
  fetchCalls = 0;
  globalThis.fetch = (() => { fetchCalls += 1; throw new Error('Demo must not use network'); }) as typeof fetch;
});
test.afterEach(() => { expect(fetchCalls).toBe(0); globalThis.fetch = originalFetch; });
const read = (currency: 'USD' | 'SGD' | 'CNH' | 'HKD' | null = null) =>
  demoPortfolioSource.readSnapshot({ currency, refreshBrokers: true, requireCached: false });
const sum = (numbers: number[]) => numbers.reduce((total, value) => total + value, 0);
const close = (actual: number, expected: number) => expect(actual).toBeCloseTo(expected, 6);

test('fabricated holdings and cash total exactly USD 500,000 toward a USD 1,000,000 goal', async () => {
  const snapshot = await read();
  expect(DEMO_HOLDINGS).toHaveLength(13);
  expect(DEMO_CASH_USD).toBe(45_000);
  expect(DEMO_INITIAL_CAPITAL_USD).toBe(463_000);
  expect(snapshot.summary.total_value_base).toBe(500_000);
  expect(snapshot.summary.positions_value_base).toBe(455_000);
  expect(snapshot.summary.unrealized_pnl_base).toBe(37_000);
  expect(DEMO_DEFAULT_GOAL).toEqual({ target: 1_000_000, currency: 'USD' });
  const groups = snapshot.organization!.groups;
  expect(groups).toEqual(DEFAULT_GROUPS);
  for (const [id, expected] of [['index', 145_000], ['core', 165_000], ['defensive', 95_000], ['satellite', 50_000]] as const) {
    const name = groups.find(group => group.id === id)!.name;
    expect(snapshot.category_allocation.find(row => row.category === name)?.value_base).toBe(expected);
  }
  expect(snapshot.positions.find(position => position.symbol === 'NVDA')?.allocation_group_id).toBe('core');
  close(sum(snapshot.category_allocation.map(row => row.value_base)), 500_000);
  expect(snapshot.organization!.targets).toEqual({ index: 29, core: 33, defensive: 19, satellite: 10 });
  expect(snapshot.organization!.cashTarget).toBe(9);
});

test('all quantities, prices, costs and P&L are internally consistent', async () => {
  const snapshot = await read();
  for (const position of snapshot.positions) {
    expect(Number.isInteger(position.quantity)).toBe(true);
    close(position.market_value_native, position.quantity * position.current_price_native!);
    close(position.unrealized_pnl_native!, position.quantity * (position.current_price_native! - position.average_cost_native!));
    expect(position.daily_pnl_native).toBeNull();
  }
  close(sum(snapshot.positions.map(position => position.market_value_base)) + DEMO_CASH_USD, 500_000);
  expect(snapshot.summary.daily_pnl_base).toBeNull();
  expect(snapshot.mode).toBe('mock');
  expect(snapshot.broker_status).toEqual([]);
  expect(snapshot.fund_assets).toBeNull();
  expect(snapshot.positions.every(position => position.broker_key === 'demo')).toBe(true);
});

test('every reporting currency uses the same fixed mock FX table', async () => {
  expect(DEMO_FX_PER_USD).toEqual({ USD: 1, SGD: 1.35, CNH: 7.2, HKD: 7.8 });
  for (const currency of ['USD', 'SGD', 'CNH', 'HKD'] as const) {
    const snapshot = await read(currency);
    close(snapshot.summary.total_value_base, 500_000 * DEMO_FX_PER_USD[currency]);
    expect(snapshot.fx_rates.every(rate => rate.source === 'mock')).toBe(true);
    close(demoRate(currency, 'USD') * demoRate('USD', currency), 1);
  }
});

test('local group edits never change portfolio value and targets require exactly 100', async () => {
  await demoPortfolioSource.saveClassification('demo', 'NVDA', 'satellite');
  const moved = await read();
  expect(moved.positions.find(position => position.symbol === 'NVDA')?.allocation_group_id).toBe('satellite');
  close(moved.summary.total_value_base, 500_000);
  const groups = moved.organization!.groups;
  expect(moved.category_allocation.find(row => row.category === groups.find(group => group.id === 'core')!.name)?.value_base).toBe(140_000);
  assignDemoHolding('NVDA', 'core');
  expect(() => saveDemoTargets({ index: 29, core: 33, defensive: 19, satellite: 11 }, 9)).toThrow();
  expect(readDemoOrganization().targets.satellite).toBe(10);
  await expect(demoPortfolioSource.saveClassification('demo', 'UNKNOWN', 'core')).rejects.toThrow();
  await expect(demoPortfolioSource.saveClassification('moomoo', 'NVDA', 'core')).rejects.toThrow();
});

test('refresh and revaluation stay deterministic', async () => {
  const readings: Portfolio[] = [await read(), await read('USD'), await read()];
  expect(readings[0]).toEqual(readings[1]);
  expect(readings[0]).toEqual(readings[2]);
  expect(readings[0].native_generation).toBeGreaterThan(0);
  expect(readings[0].native_instance_id).toMatch(/^demo-/);
});

test('group creation, rename and deletion keep targets valid and ungroup holdings', async () => {
  createDemoGroup('Opportunity');
  const created = readDemoOrganization().groups.find(group => group.name === 'Opportunity')!;
  expect(readDemoOrganization().targets[created.id]).toBe(0);
  renameDemoGroup(created.id, 'Long term');
  assignDemoHolding('NVDA', created.id);
  deleteDemoGroup(created.id);
  const snapshot = await read();
  expect(snapshot.positions.find(position => position.symbol === 'NVDA')?.allocation_group_id).toBeNull();
  expect(snapshot.category_allocation.find(row => row.category === 'Unclassified')?.value_base).toBe(25_000);
  expect(snapshot.summary.total_value_base).toBe(500_000);
  expect(snapshot.organization!.targets).toEqual({ index: 29, core: 33, defensive: 19, satellite: 10 });
  expect(snapshot.organization!.cashTarget).toBe(9);
  expect(() => createDemoGroup('Cash')).toThrow();
});
