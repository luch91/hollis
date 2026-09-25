import { defineConfig, devices } from "@playwright/test";

const webOrigin = "http://127.0.0.1:3101";
const apiOrigin = "http://127.0.0.1:4321";
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL as "chrome" | undefined;

export default defineConfig({
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  outputDir: "test-results/playwright",
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], channel: browserChannel },
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 7"], channel: browserChannel },
    },
    {
      grep: /@a11y/,
      name: "chromium-accessibility",
      use: { ...devices["Desktop Chrome"], channel: browserChannel, reducedMotion: "reduce" },
    },
  ],
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  retries: process.env.CI ? 1 : 0,
  testDir: "tests/e2e",
  testIgnore: ["**/real-workflow.spec.ts"],
  timeout: 90_000,
  use: {
    baseURL: webOrigin,
    colorScheme: "light",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @hollis/api exec tsx ../../tests/e2e/harness/api-server.mjs",
      env: {
        ...process.env,
        API_HOST: "127.0.0.1",
        API_PORT: "4321",
        DATABASE_URL:
          process.env.E2E_DATABASE_RUNTIME_URL ??
          "postgres://hollis_app:hollis_app@127.0.0.1:5434/hollis_e2e",
        HOLLIS_E2E_FORCE_EXPORT_FAILURE_CASE_ID: "00000000-0000-4000-8000-000000000418",
        NODE_ENV: "test",
        PUBLIC_ATTESTATION_ORIGIN: "https://api.hollis.test",
        WEB_ORIGIN: webOrigin,
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: `${apiOrigin}/health/live`,
    },
    {
      command: "pnpm --filter @hollis/web exec next start -p 3101",
      env: {
        ...process.env,
        NEXT_PUBLIC_API_URL: apiOrigin,
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: webOrigin,
    },
  ],
  workers: 1,
});
