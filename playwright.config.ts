import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration.
 *
 * Usage:
 *   npx playwright test              # Run all E2E tests
 *   npx playwright test --ui         # Interactive UI mode
 *   npx playwright test --headed     # Watch in browser
 *
 * Requires:
 *   - Dev server running (starts automatically via webServer config)
 *   - E2E_TEST_EMAIL / E2E_TEST_PASSWORD env vars (or .env.test)
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // sequential — tests may share auth state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 30_000,

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
