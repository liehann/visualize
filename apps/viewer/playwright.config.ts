import { defineConfig, devices } from '@playwright/test';

/**
 * Dogfood: these tests exercise the viewer UI and produce a Playwright
 * report (with videos + screenshots) that can be uploaded back into
 * Visualize.
 *
 * Run locally:
 *   pnpm --filter @visualize/viewer test
 *
 * Test groups run in dependency order. `empty` covers the home /
 * sign-in / health smoke tests against a clean DB; `seeded` runs the
 * real-flow feature tour after seeding a fixture project, so its
 * data doesn't break the empty-state assertions.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'playwright-report/report.json' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on',
    video: 'on',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'empty',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: ['**/feature-tour.spec.ts'],
    },
    {
      name: 'seeded',
      use: { ...devices['Desktop Chrome'] },
      testMatch: ['**/feature-tour.spec.ts'],
      dependencies: ['empty'],
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
