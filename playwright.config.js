import { defineConfig } from '@playwright/test';

const liveProvider = process.env.VXPODS_LIVE_PROVIDER === '1';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  workers: 2,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    // Live diagnostics send real credentials; never capture their requests.
    trace: liveProvider ? 'off' : 'retain-on-failure',
    screenshot: liveProvider ? 'off' : 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    // Always test this checkout's build, including during local verification.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
