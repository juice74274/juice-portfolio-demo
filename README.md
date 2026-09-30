# Juice Portfolio

A local-first portfolio dashboard built around a normalized portfolio snapshot, so the UI never needs to know where the portfolio data came from.

> **This repository contains the public static demo.** All holdings, quantities, costs, prices and balances are fabricated for demonstration purposes. It does not connect to any broker, contains no real account data, needs no API keys and makes no portfolio-data network requests.

The demo lets visitors try the product's UI and interactions without the private broker integrations it was designed around. The interface is in Simplified Chinese.

---

## What it demonstrates

The demo starts from a fictional investor with about **USD 300,000** of initial capital and a **USD 1,000,000** wealth goal. Both figures are fabricated demo data.

- **Portfolio overview and valuation**: total portfolio value and total unrealized P&L, valued in the browser from the static snapshot.
- **Holdings table**: search, per-holding details, cost, price, market value and P&L.
- **Editable holding classification**: every holding starts unclassified, and the visitor assigns each one to Core, Mid, High Beta or Bonds.
- **Allocation visualization**: actual allocation by category, which updates as soon as a classification changes.
- **Adjustable allocation targets**: a four-layer target (Core / Mid / Growth / Cash), edited on a draggable segmented bar that always sums to 100%.
- **Independent wealth goal**: a target amount in its own currency, with progress tracked separately from the reporting currency.
- **Reporting currency switching**: USD, SGD, CNH and HKD.
- **Fixed mock FX**: one static rate table used for every conversion, so currency switching and goal conversion always agree.
- **Editable dashboard identity**: the workspace name (for example, "Juice's Dashboard") can be changed. The product name stays fixed.
- **Browser-local persistence**: classifications, targets, goal, currency and name are kept across reloads.
- **Refresh without network calls**: Refresh re-reads the same static snapshot, keeps every local preference and sends no request.

---

## Architecture

The dashboard depends on one boundary, `PortfolioSource`, and on one data shape, `PortfolioSnapshot` (the `Portfolio` type in `src/types.ts`).

```
Dashboard UI
     ↓
PortfolioSource            (src/portfolioSource.ts)
     ↓
DemoPortfolioSource        (src/demo/demoPortfolioSource.ts)
     ↓
Fabricated PortfolioSnapshot + fixed FX   (src/demo/)
```

`PortfolioSource` has two jobs: read a snapshot in a requested currency, and save a holding's classification. Accounts, positions, cash, FX rates, allocations and freshness metadata all arrive inside that one normalized snapshot. The UI renders the snapshot. It does not know, or need to know, whether it came from a broker or from a fixture.

Snapshot validation and response ordering stay on the UI side of the boundary (`src/App.tsx`), so they work the same way for every source. That includes rejecting malformed snapshots, single-flight Refresh and handling superseded responses.

**This public repository deliberately contains only `DemoPortfolioSource`.** The wider project was designed so that other data sources can sit behind the same `PortfolioSource` boundary and keep the dashboard unchanged:

```
Private project                         Public demo (this repository)

Read-only broker adapters               Fabricated portfolio
        ↓                                       ↓
Portfolio service / normalization       DemoPortfolioSource
        ↓                                       ↓
PortfolioSnapshot                       PortfolioSnapshot
        ↓                                       ↓
Dashboard UI                            Same dashboard UI
```

> Broker adapters, backend services and any integration code are **not** included in this repository. The left-hand column is shown only to explain why the boundary exists.

The snapshot type has some fields that the demo never fills, such as broker health status and non-demo portfolio modes. They are there so the UI can handle the full snapshot shape. The demo always reports itself as a mock source with no broker.

---

## Demo data & privacy

- All positions, quantities, average costs, prices, balances and P&L are **fabricated**.
- Prices are a **frozen set of approximate reference values**, rounded for demonstration. They are not live quotes and are never refreshed at runtime.
- FX rates are **fixed mock values** (per USD: SGD 1.35, CNH 7.2, HKD 7.8), not market rates.
- No brokerage credentials are needed, and no broker account is contacted.
- No Logo.dev or other remote logo service is used. Holdings are shown with neutral initials.
- Classifications and preferences are stored **only in the browser's `localStorage`**.
- Refreshing the portfolio makes **no external portfolio-data requests**. The page only loads its own static JS/CSS assets.

The end-to-end tests check these rules. For example, one test fails if the page requests anything other than its own static files.

---

## Tech stack

- React
- TypeScript
- Vite
- CSS
- Playwright (end-to-end tests)

---

## Run locally

Requires Node.js.

```bash
npm install
npx playwright install chromium
npm run dev
```

Other scripts:

```bash
npm run typecheck   # TypeScript checks (app + e2e)
npm run build       # production build to dist/
npm run preview     # serve the production build
npm test            # build, serve on :4174 and run the Playwright suite
```

---

## Testing

The repository has **15 Playwright demo tests** (`e2e/demo/`). `npm test` builds the app and serves the production build, so the tests run against exactly what would be published.

They cover:

- loading the static demo
- no external portfolio, API or logo requests
- switching the reporting currency at the fixed mock rates
- converting the wealth goal through the same FX table
- every holding starting unclassified
- classification edits persisting across a reload
- Refresh keeping local preferences
- internal consistency of the fabricated portfolio valuation

The suite targets the demo's key behaviour and privacy rules. It is not a full coverage suite.

---

## Project structure

```
src/
  App.tsx                 app shell: snapshot loading, validation, response ordering
  portfolioSource.ts      the PortfolioSource boundary
  types.ts                the normalized snapshot types
  demo/                   DemoPortfolioSource, fabricated holdings, fixed FX, valuation
  components/             dashboard sections and cards
  *.ts                    local preferences: currency, goal, targets, identity, classification
e2e/demo/                 Playwright tests for the demo source and the running app
```

---

## Project boundaries

Juice Portfolio is strictly a **read-only portfolio visualization** project. It displays holdings and never places orders.

**Included in this repository**

- the static demo UI
- the fabricated `DemoPortfolioSource`
- the fixed mock FX table
- browser-local preferences and classifications
- the frontend demo tests

**Not included**

- real brokerage credentials
- real portfolio data
- broker SDK integrations
- private backend or runtime configuration
- trading or order functionality

---

## Design principles

- **Local-first**: preferences and classifications stay in the user's own browser.
- **Read-only by design**: portfolio data is displayed, never acted on.
- **Normalized snapshot boundary**: every source delivers the same `PortfolioSnapshot` shape.
- **Source/UI separation**: the UI renders snapshots and has no knowledge of where they come from.
- **Graceful handling of missing data**: unavailable values are shown as unavailable, never filled with a guess or a zero.
- **Privacy-conscious public demo**: fabricated data, no credentials and no external portfolio-data requests.

---

## Repository status

This repository is the **public demo edition** of Juice Portfolio. It is a static frontend demo running on fabricated data and frozen reference prices. It is not a production deployment and does not use live market data.
