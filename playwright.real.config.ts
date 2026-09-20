import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.HOLLIS_E2E_REAL_WEB_ORIGIN;
const allowedOrigin = process.env.HOLLIS_E2E_REAL_ALLOWED_ORIGIN;
const apiOrigin = process.env.HOLLIS_E2E_REAL_API_ORIGIN;
const identityToken = process.env.HOLLIS_E2E_REAL_IDENTITY_TOKEN;
const approval = process.env.HOLLIS_E2E_APPROVED_ENVIRONMENT;
const reviewCaseId = process.env.HOLLIS_E2E_REAL_REVIEW_CASE_ID;
const workspaceName = process.env.HOLLIS_E2E_REAL_WORKSPACE_NAME;
const protectionBypassSecret = process.env.HOLLIS_E2E_REAL_PROTECTION_BYPASS_SECRET;
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL as "chrome" | undefined;

if (
  !baseURL ||
  !allowedOrigin ||
  !apiOrigin ||
  !identityToken ||
  !approval ||
  !reviewCaseId ||
  !workspaceName
) {
  throw new Error(
    "The real workflow requires its web origin, API origin, exact allowed origin, identity token, approved environment class, review case ID, and workspace name.",
  );
}
const parsed = new URL(baseURL);
const parsedApiOrigin = new URL(apiOrigin);
const normalizedAllowedOrigin = new URL(allowedOrigin).origin;
const productionHosts = new Set(["thehollis.xyz", "www.thehollis.xyz", "thehollis.vercel.app"]);
if (
  parsed.protocol !== "https:" ||
  parsedApiOrigin.protocol !== "https:" ||
  parsed.origin !== normalizedAllowedOrigin ||
  !["evaluation", "staging", "test"].includes(approval.trim().toLowerCase()) ||
  productionHosts.has(parsed.hostname.toLowerCase()) ||
  productionHosts.has(parsedApiOrigin.hostname.toLowerCase())
) {
  throw new Error(
    "Real workflow tests require an exact allowlisted HTTPS origin in an evaluation, staging, or test environment and reject known production hosts.",
  );
}
if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(reviewCaseId)) {
  throw new Error("HOLLIS_E2E_REAL_REVIEW_CASE_ID must be a case UUID.");
}

export default defineConfig({
  forbidOnly: true,
  outputDir: "test-results/playwright-real",
  projects: [
    { name: "real-chromium", use: { ...devices["Desktop Chrome"], channel: browserChannel } },
  ],
  reporter: [["line"], ["html", { open: "never", outputFolder: "playwright-report-real" }]],
  testDir: "tests/e2e",
  testMatch: "real-workflow.spec.ts",
  timeout: 90_000,
  use: {
    baseURL,
    extraHTTPHeaders: protectionBypassSecret
      ? {
          "x-vercel-protection-bypass": protectionBypassSecret,
          "x-vercel-set-bypass-cookie": "true",
        }
      : undefined,
    screenshot: "only-on-failure",
    trace: "off",
  },
  workers: 1,
});
