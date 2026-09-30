import { defineConfig } from '@playwright/test'

// The demo specs, against the REAL static build: the run builds dist/ and serves it with
// `vite preview` on 4174, so what is tested is exactly what would be published.
// reuseExistingServer is false, so the run refuses to start if something else already holds the
// port instead of testing against it.
export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/demo/**/*.spec.ts'],
  outputDir: './test-results',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4174',
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 1080 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4174',
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
