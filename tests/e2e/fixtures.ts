import { expect, test as base, type Page } from "@playwright/test";

export type E2ERole = "owner" | "administrator" | "reviewer" | "contributor" | "auditor";

export async function establishRoleSession(page: Page, role: E2ERole | "outside-owner") {
  await page.goto("/");
  const response = await page.request.post("/api/auth/session", {
    data: { identityToken: `e2e-${role}` },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app/);
}

export const test = base.extend({
  page: async ({ page }, use) => {
    const failures: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") failures.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
    page.on("requestfailed", (request) => {
      const url = new URL(request.url());
      const errorText = request.failure()?.errorText ?? "unknown failure";
      if (["127.0.0.1", "localhost"].includes(url.hostname) && !errorText.includes("ERR_ABORTED")) {
        failures.push(`requestfailed: ${request.method()} ${url.pathname} (${errorText})`);
      }
    });
    await use(page);
    expect(failures, failures.join("\n")).toEqual([]);
  },
});

export { expect } from "@playwright/test";
