import { defineConfig, devices } from '@playwright/test';

const apiBaseUrl = 'http://127.0.0.1:4010/v1';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3002',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node tests/e2e/mock-api-server.mjs',
      port: 4010,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `API_BASE_URL=${apiBaseUrl} NEXT_PUBLIC_API_BASE_URL=${apiBaseUrl} NEXT_PUBLIC_STORE_APP_URL=http://127.0.0.1:3002 NEXT_PUBLIC_ADMIN_APP_URL=http://127.0.0.1:3001 npm run dev --workspace @mvp/login-web`,
      port: 3000,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `API_BASE_URL=${apiBaseUrl} NEXT_PUBLIC_API_BASE_URL=${apiBaseUrl} NEXT_PUBLIC_LOGIN_APP_URL=http://127.0.0.1:3000 npm run dev --workspace @mvp/store-web`,
      port: 3002,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
