# Juice Portfolio public demo

**Live demo:** https://juice-portfolio-demo.vercel.app/

This repository contains a static, read-only demonstration of Juice Portfolio. Every holding, quantity, price, cost, balance, and P&L figure is fabricated. The app has no broker connection, credentials, backend, trading action, or portfolio-data network request.

## What visitors can try

- A dashboard with an overview, wealth goal, allocation table, and searchable holdings ledger.
- **Allocation Groups:** rename, reorder, create, or delete groups and assign holdings to them. Changes stay in this browser.
- A collapsible **100% target editor** with one segment per group plus Cash. Drag a boundary or use arrow keys in whole 1 percentage-point steps. Saving updates the allocation table and browser-local preference.
- Reporting currency switching among USD, SGD, CNH, and HKD using fixed mock FX rates.
- A separate editable wealth goal and dashboard name, also stored locally.

There are no Tags or broker/trading controls in this demo.

## Fabricated portfolio

The frozen USD valuation is **exactly $500,000**:

| Allocation Group | Holdings | Value |
| --- | --- | ---: |
| 定投层 / Index Investing | VOO, QQQ | $145,000 |
| 核心层 / Core | MSFT, AAPL, GOOGL, NVDA | $165,000 |
| 防御层 / Defensive | BRK.B, SCHD, WMT, KO | $95,000 |
| 高弹性层 / Aggressive Satellite | PLTR, HOOD, RKLB | $50,000 |
| Cash | USD cash | $45,000 |

The target allocation remains 29% Index Investing, 33% Core, 19% Defensive, 10% Aggressive Satellite, and 9% Cash. The synthetic cost basis including cash is $463,000, giving $37,000 of synthetic unrealized P&L. Prices are invented fixture values, frozen at the demo snapshot date. They are not quotes. The default wealth goal is a separate synthetic $1,000,000 USD setting, so initial progress is 50%.

## Architecture and privacy

`src/demo/mockPortfolio.ts` contains fabricated native facts. `src/demo/valuePortfolio.ts` values them through fixed mock FX. `DemoPortfolioSource` is the only `PortfolioSource`; it never calls a broker or API. The React dashboard reads the resulting `Portfolio` snapshot. `src/demo/demoOrganization.ts` validates browser-local group, assignment, and target changes. Refresh re-reads the same fixture without network calls.

No remote logo service is used; holdings have neutral local initials. Browser-local settings are scoped to this demo. The app loads only its own static assets.

## Run and verify

Requires Node.js and Chromium for Playwright.

```bash
npm install
npx playwright install chromium
npm run typecheck
npm run build
npm test
```

`npm test` builds and serves the production bundle on port 4174, then runs browser and source tests. The tests cover exact synthetic totals and group values, target stepping and persistence, currency conversion, local group edits, and absence of external portfolio requests.
