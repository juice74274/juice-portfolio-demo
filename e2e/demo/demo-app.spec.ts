import { expect, test, type Page, type Request } from '@playwright/test'

// The demo in a real browser, against the built dist/ served by `vite preview`
// (playwright.config.ts). Nothing here is intercepted: the demo has no server to fake, and the
// point of these tests is that it never asks for one.
//
// The expected figures are the fabricated demo portfolio's (src/demo/mockPortfolio.ts):
// USD 319,075.60 in total, valued at the fixed demo rates USD 1 = SGD 1.35 = CNH 7.20 = HKD 7.80.

const ORIGIN = 'http://localhost:4174'
const TOTAL = { USD: '$319,075.60', SGD: 'S$430,752.06', CNH: 'CNH2,297,344.32', HKD: 'HK$2,488,789.68' }

const KEYS = {
  identity: 'folio.dashboardIdentity',
  goal: 'folio.wealthGoal',
  targets: 'folio.allocationTargets',
  classification: 'folio.demoClassification',
}

/** Every request the page makes from now on. */
function recordRequests(page: Page): Request[] {
  const requests: Request[] = []
  page.on('request', request => requests.push(request))
  return requests
}

const total = (page: Page) => page.locator('.total-number')
const currencySelect = (page: Page) => page.getByLabel('统计币种')
const refreshButton = (page: Page) => page.locator('.refresh-button')
const categorySelect = (page: Page, symbol: string) => page.getByLabel(`设置 ${symbol}（Demo）的分类`)
const stored = (page: Page, key: string) => page.evaluate(name => window.localStorage.getItem(name), key)

async function open(page: Page) {
  await page.goto('/')
  await expect(total(page)).toHaveText(TOTAL.USD)
}

test('loads with no request beyond its own static files: no API, no logos, no Logo.dev', async ({ page }) => {
  const requests = recordRequests(page)
  await open(page)
  await expect(page.locator('tr .holding-logo-fallback').first()).toBeVisible()

  expect(requests.length).toBeGreaterThan(0)
  for (const request of requests) {
    const url = new URL(request.url())
    expect(url.origin, request.url()).toBe(ORIGIN)
    expect(url.pathname, request.url()).not.toMatch(/^\/(api|logos)\//)
  }
  expect(requests.some(request => request.url().includes('logo.dev'))).toBe(false)
  // Every holding shows the neutral initial; no logo image is even attempted.
  await expect(page.locator('img.holding-logo')).toHaveCount(0)
})

test('says it is demo data and names no real broker', async ({ page }) => {
  await open(page)
  await expect(page.locator('.mock-badge')).toHaveText('模拟数据')
  await expect(page.getByTestId('broker-unavailable-notice')).toHaveCount(0)
  await expect(page.getByTestId('broker-unverified-notice')).toHaveCount(0)
  const text = await page.locator('body').innerText()
  for (const broker of ['Moomoo', 'Tiger', 'Webull', 'uSMART']) expect(text, broker).not.toContain(broker)
  const description = await page.locator('meta[name="description"]').getAttribute('content')
  expect(description).not.toMatch(/Moomoo|Tiger|Webull|uSMART/i)
})

test('switches reporting currency across USD, SGD, CNH and HKD at the fixed rates', async ({ page }) => {
  const requests = recordRequests(page)
  await open(page)
  requests.length = 0
  for (const currency of ['SGD', 'CNH', 'HKD', 'USD'] as const) {
    await currencySelect(page).selectOption(currency)
    await expect(total(page)).toHaveText(TOTAL[currency])
  }
  expect(requests).toEqual([])
})

test('the wealth goal defaults to USD 1,000,000 and converts with the same FX', async ({ page }) => {
  const requests = recordRequests(page)
  await open(page)
  requests.length = 0
  await expect(page.getByTestId('goal-target')).toHaveText('$1,000,000.00')
  await expect(page.getByTestId('goal-current')).toHaveText('$319,075.60')
  await expect(page.getByTestId('goal-percent')).toHaveText('31.9%')

  // Reporting in SGD leaves the goal in USD, converted back at the same fixed rate.
  await currencySelect(page).selectOption('SGD')
  await expect(total(page)).toHaveText(TOTAL.SGD)
  await expect(page.getByTestId('goal-target')).toHaveText('$1,000,000.00')
  await expect(page.getByTestId('goal-current')).toHaveText('$319,075.60')

  // A goal in SGD while reporting in USD: the USD total at USD 1 = SGD 1.35.
  await currencySelect(page).selectOption('USD')
  await page.getByTestId('goal-edit').click()
  await page.getByTestId('goal-editor').locator('select').selectOption('SGD')
  await page.getByLabel('目标金额').fill('1,000,000')
  await page.getByTestId('goal-save').click()
  await expect(page.getByTestId('goal-target')).toHaveText('S$1,000,000.00')
  await expect(page.getByTestId('goal-current')).toHaveText('S$430,752.06')
  await expect(page.getByTestId('goal-percent')).toHaveText('43.1%')
  expect(JSON.parse((await stored(page, KEYS.goal))!)).toEqual({ target: 1_000_000, currency: 'SGD' })
  expect(requests).toEqual([])
})

test('every holding starts unclassified', async ({ page }) => {
  await open(page)
  for (const symbol of ['GOOG', 'MSFT', 'NVDA', 'AVGO', 'SNOW', 'RKLB', 'LITE', 'NBIS']) {
    // '' is the unselectable "needs classification" placeholder: no category chosen yet.
    await expect(categorySelect(page, symbol), symbol).toHaveValue('')
  }
  for (const layer of ['core', 'mid', 'growth']) await expect(page.getByTestId(`alloc-actual-${layer}`)).toHaveText('0.00%')
  expect(await stored(page, KEYS.classification)).toBeNull()
})

test('a classification edit moves Allocation at once and persists across a reload', async ({ page }) => {
  await open(page)
  await categorySelect(page, 'NBIS').selectOption('core')
  await expect(categorySelect(page, 'NBIS')).toHaveValue('core')
  // NBIS is USD 23,700 of USD 319,075.60.
  await expect(page.getByTestId('alloc-actual-core')).toHaveText('7.43%')
  expect(JSON.parse((await stored(page, KEYS.classification))!)).toEqual({ NBIS: 'core' })

  await page.reload()
  await expect(total(page)).toHaveText(TOTAL.USD)
  await expect(categorySelect(page, 'NBIS')).toHaveValue('core')
  await expect(page.getByTestId('alloc-actual-core')).toHaveText('7.43%')
  await expect(categorySelect(page, 'RKLB')).toHaveValue('')
})

/** The computed rgb() a CSS custom property resolves to, so expectations follow the palette. */
const tokenColor = (page: Page, token: string) => page.evaluate(name => {
  const probe = document.createElement('span')
  probe.style.color = `var(${name})`
  document.body.append(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return color
}, token)

const positionRow = (page: Page, symbol: string) =>
  page.locator('.positions-table tbody tr').filter({ has: page.locator('th strong', { hasText: new RegExp(`^${symbol}$`) }) })

test('position P&L is red for a loss and green for a gain; market value stays neutral', async ({ page }) => {
  await open(page)
  const [lossRed, gainGreen, neutral, muted] = await Promise.all(
    ['--neg', '--pos-strong', '--ink-2', '--muted-2'].map(token => tokenColor(page, token)))
  expect(new Set([lossRed, gainGreen, neutral, muted]).size).toBe(4)

  // Cells after the row header: type, quantity, price, market value, unrealized, holding P&L, %.
  // SNOW: 80 shares bought at 350, now 330.
  const snow = positionRow(page, 'SNOW').locator('td')
  await expect(snow.nth(3)).toHaveText('USD 26,400.00')
  await expect(snow.nth(5)).toHaveText('USD −1,600.00')
  await expect(snow.nth(6)).toHaveText('−5.71%')
  await expect(snow.nth(5)).toHaveCSS('color', lossRed)
  await expect(snow.nth(6)).toHaveCSS('color', lossRed)
  await expect(snow.nth(3)).toHaveCSS('color', neutral)
  // The currency code inside a loss recedes to gray rather than turning red.
  await expect(snow.nth(5).locator('.amount-code')).toHaveText('USD')
  await expect(snow.nth(5).locator('.amount-code')).toHaveCSS('color', muted)

  // NVDA: 250 shares bought at 190, now 229.73.
  const nvda = positionRow(page, 'NVDA').locator('td')
  await expect(nvda.nth(5)).toHaveText('USD +9,932.50')
  await expect(nvda.nth(6)).toHaveText('+20.91%')
  await expect(nvda.nth(5)).toHaveCSS('color', gainGreen)
  await expect(nvda.nth(6)).toHaveCSS('color', gainGreen)
  await expect(nvda.nth(3)).toHaveCSS('color', neutral)
})

test('Refresh makes no request and keeps every local preference', async ({ page }) => {
  const seeded: Record<string, string> = {
    [KEYS.identity]: JSON.stringify({ displayName: 'Ava' }),
    [KEYS.goal]: JSON.stringify({ target: 2_000_000, currency: 'USD' }),
    [KEYS.targets]: JSON.stringify({ core: 40, mid: 20, growth: 30, cash: 10 }),
    [KEYS.classification]: JSON.stringify({ SNOW: 'core' }),
  }
  await page.addInitScript(values => {
    if (window.sessionStorage.getItem('seeded')) return
    for (const [key, value] of Object.entries(values)) window.localStorage.setItem(key, value)
    window.sessionStorage.setItem('seeded', '1')
  }, seeded)
  const requests = recordRequests(page)
  await open(page)
  await expect(page.getByTestId('dashboard-name')).toHaveText("Ava's Dashboard")
  await expect(categorySelect(page, 'SNOW')).toHaveValue('core')

  requests.length = 0
  await refreshButton(page).click()
  await expect(refreshButton(page)).toHaveText('刷新')
  await expect(refreshButton(page)).toBeEnabled()
  await expect(total(page)).toHaveText(TOTAL.USD)
  expect(requests).toEqual([])

  for (const [key, value] of Object.entries(seeded)) expect(await stored(page, key), key).toBe(value)
  await expect(page.getByTestId('dashboard-name')).toHaveText("Ava's Dashboard")
  await expect(page.getByTestId('goal-target')).toHaveText('$2,000,000.00')
  await expect(page.getByTestId('alloc-target-growth')).toHaveText('30%')
  await expect(categorySelect(page, 'SNOW')).toHaveValue('core')
})
