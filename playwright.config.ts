import { defineConfig } from '@playwright/test'

// scripts/run-tests.mjs builds the static bundle and owns the preview process on port 4174.
// The test command refuses an occupied port rather than testing another server.
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
})
