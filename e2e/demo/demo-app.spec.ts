import { expect, test, type Page, type Request } from '@playwright/test';

const ORIGIN = 'http://localhost:4174';
const TOTAL = { USD: '$500,000.00', SGD: 'S$675,000.00', CNH: 'CNH3,600,000.00', HKD: 'HK$3,900,000.00' };
const total = (page: Page) => page.locator('.total-number');
const groupSelect = (page: Page, symbol: string) => page.getByLabel(`设置 ${symbol} 的分组`);
const stored = (page: Page, key: string) => page.evaluate(name => window.localStorage.getItem(name), key);
function recordRequests(page: Page): Request[] {
  const requests: Request[] = [];
  page.on('request', request => requests.push(request));
  return requests;
}
async function open(page: Page) {
  await page.goto('/');
  await expect(total(page)).toHaveText(TOTAL.USD);
}

test('static mock demo makes no outside request', async ({ page }) => {
  const requests = recordRequests(page);
  await open(page);
  await expect(page.locator('.mock-badge')).toHaveText('模拟数据');
  await expect(page.getByTestId('goal-percent')).toHaveText('50%');
  await expect(page.getByTestId('goal-current')).toHaveText('$500,000.00');
  await expect(page.getByTestId('goal-target')).toHaveText('$1,000,000.00');
  await expect(page.locator('img.holding-logo')).toHaveCount(0);
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    const url = new URL(request.url());
    expect(url.origin).toBe(ORIGIN);
    expect(url.pathname).not.toMatch(/^\/(api|logos)\//);
  }
  const body = await page.locator('body').innerText();
  for (const broker of ['Moomoo', 'Tiger', 'Webull', 'uSMART']) expect(body).not.toContain(broker);
  expect(body).not.toContain('Tags');
});

test('recognizable groups, NVDA in Core, Cash and exact total', async ({ page }) => {
  await open(page);
  for (const symbol of ['VOO', 'QQQ', 'MSFT', 'AAPL', 'GOOGL', 'NVDA', 'BRK.B', 'SCHD', 'WMT', 'KO', 'PLTR', 'HOOD', 'RKLB']) {
    await expect(groupSelect(page, symbol)).toBeVisible();
  }
  await expect(groupSelect(page, 'NVDA')).toHaveValue('core');
  await expect(groupSelect(page, 'VOO')).toHaveValue('index');
  await expect(groupSelect(page, 'RKLB')).toHaveValue('satellite');
  await expect(page.locator('[data-group-id="cash"]')).toContainText('45,000');
});

test('currency switching and Refresh use no portfolio network request', async ({ page }) => {
  const requests = recordRequests(page);
  await open(page);
  requests.length = 0;
  for (const currency of ['SGD', 'CNH', 'HKD', 'USD'] as const) {
    await page.getByLabel('统计币种').selectOption(currency);
    await expect(total(page)).toHaveText(TOTAL[currency]);
  }
  await page.locator('.refresh-button').click();
  await expect(total(page)).toHaveText(TOTAL.USD);
  expect(requests).toEqual([]);
});

test('holding group edits update allocation and survive reload', async ({ page }) => {
  await open(page);
  await groupSelect(page, 'NVDA').selectOption('satellite');
  await expect(groupSelect(page, 'NVDA')).toHaveValue('satellite');
  await expect(page.locator('[data-group-id="core"]')).toContainText('140,000');
  await expect(total(page)).toHaveText(TOTAL.USD);
  await page.reload();
  await expect(groupSelect(page, 'NVDA')).toHaveValue('satellite');
  expect(JSON.parse((await stored(page, 'juice.demo.organization.v1'))!).assignments.NVDA).toBe('satellite');
});

test('collapsible target slider moves one percentage point and stays at 100%', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('target-plan-editor')).toHaveCount(0);
  await page.getByTestId('edit-targets').click();
  await expect(page.getByTestId('target-plan-editor')).toBeVisible();
  const first = page.getByTestId('target-handle').first();
  await expect(first).toHaveAttribute('aria-valuenow', '29');
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(first).toHaveAttribute('aria-valuenow', '30');
  await expect(page.getByTestId('target-total')).toHaveText('100%');
  const track = await page.getByTestId('target-slider').boundingBox();
  const handle = await first.boundingBox();
  expect(track).not.toBeNull();
  expect(handle).not.toBeNull();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle!.x + handle!.width / 2 + track!.width * 0.01, handle!.y + handle!.height / 2);
  await page.mouse.up();
  await expect(first).toHaveAttribute('aria-valuenow', '31');
  await expect(page.getByTestId('target-total')).toHaveText('100%');
  await page.getByTestId('target-save').click();
  await expect(page.getByTestId('alloc-target-index')).toHaveText('31%');
  await page.reload();
  await expect(page.getByTestId('alloc-target-index')).toHaveText('31%');
  await expect(page.getByTestId('target-plan-editor')).toHaveCount(0);
});

test('group manager renames and reorders locally', async ({ page }) => {
  await open(page);
  await page.getByTestId('manage-groups').click();
  const dialog = page.getByTestId('group-manager');
  await expect(dialog).toBeVisible();
  const field = dialog.getByLabel('分组名称 核心层 / Core');
  await field.fill('长期核心 / Core');
  await field.press('Enter');
  await expect(dialog.getByLabel('分组名称 长期核心 / Core')).toBeVisible();
  await dialog.getByLabel('上移 长期核心 / Core').click();
  await expect(page.locator('.category-table tbody tr').first()).toContainText('长期核心 / Core');
  await page.reload();
  await expect(page.locator('.category-table tbody tr').first()).toContainText('长期核心 / Core');
});
