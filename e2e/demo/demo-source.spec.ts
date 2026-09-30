import { expect, test } from '@playwright/test'
import type { Portfolio } from '../../src/types'
import {
  DEMO_DEFAULT_GOAL, DEMO_INSTANCE_ID, DEMO_NATIVE_GENERATION, demoPortfolioSource,
} from '../../src/demo/demoPortfolioSource'
import { DEMO_CASH_USD, DEMO_HOLDINGS, DEMO_INITIAL_CAPITAL_USD } from '../../src/demo/mockPortfolio'
import { DEMO_FX_PER_USD, demoRate } from '../../src/demo/mockFx'
import { DEMO_CLASSIFICATION_STORAGE_KEY } from '../../src/demo/demoClassification'

// The demo's DemoPortfolioSource, run in Node with no page, no server and no network.
// Everything it values is fabricated (src/demo/mockPortfolio.ts); these tests pin that it is
// valued consistently and honestly, in the full Portfolio shape the dashboard reads.

const CURRENCIES = ['USD', 'SGD', 'CNH', 'HKD'] as const

// A minimal localStorage, so classification edits can be exercised without a browser.
const storage = new Map<string, string>()
Object.assign(globalThis, {
  window: {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value) },
      removeItem: (key: string) => { storage.delete(key) },
    },
  },
})

// Any network use at all fails the test that caused it.
let fetchCalls = 0
test.beforeEach(() => {
  fetchCalls = 0
  globalThis.fetch = (() => { fetchCalls += 1; throw new Error('The demo must not use the network.') }) as typeof fetch
})
test.afterEach(() => { expect(fetchCalls).toBe(0) })

const read = (currency: (typeof CURRENCIES)[number] | null = null) =>
  demoPortfolioSource.readSnapshot({ currency, refreshBrokers: true, requireCached: false })

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)
const close = (actual: number, expected: number) => expect(actual).toBeCloseTo(expected, 6)

test('the fabricated story: about USD 300k in, mostly invested, positive overall', () => {
  const costBasis = sum(DEMO_HOLDINGS.map(holding => holding.quantity * holding.average_cost))
  expect(costBasis + DEMO_CASH_USD).toBe(DEMO_INITIAL_CAPITAL_USD)
  expect(DEMO_INITIAL_CAPITAL_USD).toBe(300_000)
  expect(costBasis).toBe(261_000)
  expect(DEMO_CASH_USD).toBe(39_000)
  for (const holding of DEMO_HOLDINGS) expect(Number.isInteger(holding.quantity), holding.symbol).toBe(true)
  // Some winners and some losers.
  expect(DEMO_HOLDINGS.some(holding => holding.price > holding.average_cost)).toBe(true)
  expect(DEMO_HOLDINGS.some(holding => holding.price < holding.average_cost)).toBe(true)
})

test('the USD snapshot is internally consistent', async () => {
  const snapshot = await read()
  expect(snapshot.base_currency).toBe('USD')
  const { summary } = snapshot

  for (const position of snapshot.positions) {
    close(position.market_value_native, position.quantity * position.current_price_native!)
    close(position.unrealized_pnl_native!,
      position.quantity * (position.current_price_native! - position.average_cost_native!))
    close(position.market_value_base, position.market_value_native)
  }
  close(summary.positions_value_base, sum(snapshot.positions.map(position => position.market_value_base)))
  close(summary.cash_value_base, sum(snapshot.cash_balances.map(cash => cash.amount_base)))
  close(summary.total_value_base, summary.positions_value_base + summary.cash_value_base)
  close(summary.unrealized_pnl_base!, sum(snapshot.positions.map(position => position.unrealized_pnl_base!)))
  close(summary.cash_ratio_pct!, 100 * summary.cash_value_base / summary.total_value_base)

  // Current total in the requested 300k-350k range, cost basis about 300k, overall positive.
  expect(summary.total_value_base).toBeGreaterThanOrEqual(300_000)
  expect(summary.total_value_base).toBeLessThanOrEqual(350_000)
  close(summary.total_value_base - summary.unrealized_pnl_base!, DEMO_INITIAL_CAPITAL_USD)
  expect(summary.unrealized_pnl_base!).toBeGreaterThan(0)
  close(summary.total_value_base, 319_075.6)
  close(summary.unrealized_pnl_base!, 19_075.6)
  // One frozen price snapshot has no day's move: unavailable, never invented.
  expect(snapshot.positions.every(position => position.daily_pnl_native === null)).toBe(true)
  expect(summary.daily_pnl_base).toBeNull()

  // Every allocation view adds up to the same total.
  close(sum(snapshot.category_allocation.map(item => item.value_base)), summary.total_value_base)
  close(sum(snapshot.category_allocation.map(item => item.actual_pct!)), 100)
  close(sum(snapshot.asset_allocation.map(item => item.value_base)), summary.total_value_base)
  close(sum(snapshot.broker_allocation.map(item => item.value_base)), summary.total_value_base)
  const cash = snapshot.category_allocation.find(item => item.category === 'Cash')!
  close(cash.value_base, summary.cash_value_base)

  // Native denomination: all USD, and equal to the USD total.
  expect(snapshot.native_totals).toHaveLength(1)
  close(snapshot.native_totals[0].total_value_native, summary.total_value_base)
})

test('every holding starts unclassified, for the visitor to classify', async () => {
  const snapshot = await read()
  expect(snapshot.positions).toHaveLength(8)
  for (const position of snapshot.positions) {
    expect(position, position.symbol).toMatchObject({ category: 'Unclassified', classification_state: 'needs_classification' })
  }
  const bucket = (category: string) => snapshot.category_allocation.find(item => item.category === category)
  for (const category of ['Core', 'Mid', 'High Beta', 'Bonds']) expect(bucket(category)?.value_base, category).toBe(0)
  close(bucket('Unclassified')!.value_base, snapshot.summary.positions_value_base)
})

test('every reporting currency is the USD snapshot at the fixed demo rate', async () => {
  expect(DEMO_FX_PER_USD).toEqual({ USD: 1, SGD: 1.35, CNH: 7.2, HKD: 7.8 })
  const usd = await read('USD')
  for (const currency of CURRENCIES) {
    const snapshot = await read(currency)
    const rate = DEMO_FX_PER_USD[currency]
    expect(snapshot.base_currency).toBe(currency)
    close(snapshot.summary.total_value_base, usd.summary.total_value_base * rate)
    close(snapshot.summary.unrealized_pnl_base!, usd.summary.unrealized_pnl_base! * rate)
    close(snapshot.summary.cash_value_base, usd.summary.cash_value_base * rate)
    // Native facts never change with the reporting currency.
    expect(snapshot.native_totals).toEqual(usd.native_totals)
    // The reported FX table is the same table, from the same pivot, and says it is mock.
    for (const fx of snapshot.fx_rates) {
      expect(fx.source).toBe('mock')
      close(fx.rate, demoRate(fx.currency, currency))
    }
  }
  // Triangular: any round trip is exactly 1.
  for (const from of CURRENCIES) for (const to of CURRENCIES) close(demoRate(from, to) * demoRate(to, from), 1)
})

test('the wealth goal defaults to USD 1,000,000 and converts through the same FX', async () => {
  expect(demoPortfolioSource.defaultGoal).toEqual({ target: 1_000_000, currency: 'USD' })
  expect(DEMO_DEFAULT_GOAL).toBe(demoPortfolioSource.defaultGoal)
  // The goal card's conversion is a read in the goal's currency through this same source, so a
  // goal in SGD sees the USD total at exactly the reporting-currency rate.
  const usd = await read('USD')
  const sgd = await read('SGD')
  close(sgd.summary.total_value_base, usd.summary.total_value_base * demoRate('USD', 'SGD'))
})

test('no broker status, no real broker, and a demo identity', async () => {
  for (const currency of [null, ...CURRENCIES]) {
    const snapshot = await read(currency)
    expect(snapshot.mode).toBe('mock')
    expect(snapshot.broker_status).toEqual([])
    expect(snapshot.fund_assets).toBeNull()
    expect(snapshot.accounts).toEqual([{
      id: 'demo-account', broker: 'Demo', name: 'Demo Portfolio', account_type: 'mock', base_currency: 'USD',
    }])
    const text = JSON.stringify(snapshot).toLowerCase()
    for (const broker of ['moomoo', 'tiger', 'webull', 'usmart']) expect(text, broker).not.toContain(broker)
    expect(snapshot.positions.every(position => position.broker === 'Demo' && position.broker_key === 'demo')).toBe(true)
  }
})

test('generation and instance are non-zero, stable and demo-specific', async () => {
  expect(DEMO_NATIVE_GENERATION).toBeGreaterThan(0)
  expect(DEMO_INSTANCE_ID).toMatch(/^demo-/)
  const reads: Portfolio[] = []
  for (const currency of [null, ...CURRENCIES, null]) reads.push(await read(currency))
  // A refresh-shaped read and a revaluation-shaped read are the same snapshot.
  reads.push(await demoPortfolioSource.readSnapshot({ currency: null, refreshBrokers: false, requireCached: true }))
  for (const snapshot of reads) {
    expect(snapshot.native_generation).toBe(DEMO_NATIVE_GENERATION)
    expect(snapshot.native_instance_id).toBe(DEMO_INSTANCE_ID)
  }
  // Refresh rebuilds the identical static snapshot.
  expect(await read()).toEqual(await read())
})

// Last in the file on purpose: an edit cannot be undone back to "no mapping", and edits are
// module state for the rest of this worker.
test('a classification edit is stored locally and applied by the next read', async () => {
  expect(demoPortfolioSource.classificationWritable('mock')).toBe(true)
  expect(demoPortfolioSource.classificationWritable(undefined)).toBe(false)

  await demoPortfolioSource.saveClassification('demo', 'NBIS', 'core')
  expect(JSON.parse(storage.get(DEMO_CLASSIFICATION_STORAGE_KEY)!)).toEqual({ NBIS: 'core' })
  const edited = await read()
  expect(edited.positions.find(position => position.symbol === 'NBIS')!)
    .toMatchObject({ category: 'Core', classification_state: 'assigned' })
  // Allocation follows at once; the total does not move.
  const core = edited.category_allocation.find(item => item.category === 'Core')!
  close(core.value_base, 100 * 237)
  close(edited.summary.total_value_base, 319_075.6)

  await demoPortfolioSource.saveClassification('demo', 'SNOW', 'unclassified')
  const unassigned = (await read()).positions.find(position => position.symbol === 'SNOW')!
  expect(unassigned).toMatchObject({ category: 'Unclassified', classification_state: 'unassigned' })

  // Only the demo's own rows can be written.
  await expect(demoPortfolioSource.saveClassification('moomoo', 'NBIS', 'mid')).rejects.toThrow()
  await expect(demoPortfolioSource.saveClassification('demo', 'AAPL', 'mid')).rejects.toThrow()
})
