import { defineConfig, devices } from '@playwright/test';

/**
 * Dogfood: these tests exercise the viewer UI and produce a Playwright
 * report (with videos + screenshots) that can be uploaded back into
 * Visualize.
 *
 * Run locally:
 *   pnpm --filter @visualize/viewer test
 *
 * The webServer block boots `next dev` so tests can run without a separate
 * service. AUTH bypass for tests is via NEXTAUTH dev mode + a special
 * `playwright` cookie; see tests/setup.ts.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // The shared Postgres + DATA_DIR is global state across spec files; running
  // multiple workers races feature-tour's seeded project against home's
  // empty-state assertion. Serialize across files too.
  workers: 1,
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
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
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
