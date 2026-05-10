import { defineConfig, devices } from '@playwright/test';

/**
 * E2E suite — boots `node server.mjs` for the example and runs against
 * the same in-memory seed every reviewer would see. Runs against the
 * production-built SPA when public/admin/dist exists, else the no-build
 * CDN SPA. Either way the contract is identical.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect:  { timeout: 5000 },
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3939',
    trace:  'on-first-retry',
  },
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'node examples/wms-vercel/server.mjs',
    url:     'http://localhost:3939/',
    timeout: 30_000,
    reuseExistingServer: !process.env.CI,
    env: { PORT: '3939' },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
