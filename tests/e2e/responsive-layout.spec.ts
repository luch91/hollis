import type { Page } from "@playwright/test";
import { establishRoleSession, expect, test } from "./fixtures";

const completedCaseId = "00000000-0000-4000-8000-000000000399";
const viewports = [
  { height: 844, name: "phone", width: 390 },
  { height: 1024, name: "tablet", width: 768 },
  { height: 900, name: "laptop", width: 1280 },
  { height: 1080, name: "wide", width: 1920 },
] as const;

async function expectNoPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test("landing and protected workspaces remain responsive across supported widths", async ({
  page,
}) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoPageOverflow(page);
    const ledgerCards = page.locator(".ledger-card");
    for (let index = 0; index < (await ledgerCards.count()); index += 1) {
      const alignment = await ledgerCards.nth(index).evaluate((card) => {
        const title = card.querySelector("strong")?.getBoundingClientRect();
        const description = card.querySelector("span")?.getBoundingClientRect();
        const icon = card.querySelector("i")?.getBoundingClientRect();
        return {
          descriptionWidth: description?.width ?? 0,
          iconLeft: icon?.left ?? 0,
          textLeftDelta: Math.abs((title?.left ?? 0) - (description?.left ?? 0)),
          textRight: Math.max(title?.right ?? 0, description?.right ?? 0),
        };
      });
      expect(alignment.textLeftDelta).toBeLessThanOrEqual(1);
      expect(alignment.descriptionWidth).toBeGreaterThan(80);
      expect(alignment.textRight).toBeLessThanOrEqual(alignment.iconLeft + 1);
    }
  }

  await establishRoleSession(page, "owner");
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const path of [
      "/app",
      "/app/review-cases",
      `/app/review-cases/${completedCaseId}`,
      "/app/policy",
      "/app/admin",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("main")).toBeVisible();
      await expectNoPageOverflow(page);
    }
  }
});

test("completed case keeps long identifiers separated and action labels legible", async ({
  page,
}) => {
  await page.addInitScript(() => window.localStorage.setItem("hollis-theme", "dark"));
  await establishRoleSession(page, "owner");
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto(`/app/review-cases/${completedCaseId}`);

    const commitment = page.getByTestId("case-commitment-summary");
    await expect(commitment).toBeVisible();
    const layout = await commitment.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const children = Array.from(element.children).map((child) => {
        const childBox = child.getBoundingClientRect();
        return { bottom: childBox.bottom, right: childBox.right };
      });
      return { box: { bottom: box.bottom, right: box.right }, children };
    });
    for (const child of layout.children) {
      expect(child.right).toBeLessThanOrEqual(layout.box.right + 1);
      expect(child.bottom).toBeLessThanOrEqual(layout.box.bottom + 1);
    }

    const labelledActions = page.locator(
      "button:visible, a.primary-action:visible, a.secondary-action:visible, a.download-receipt:visible",
    );
    const actionCount = await labelledActions.count();
    for (let index = 0; index < actionCount; index += 1) {
      const action = labelledActions.nth(index);
      const accessibleName = await action.getAttribute("aria-label");
      const visibleText = (await action.innerText()).trim();
      expect(visibleText || accessibleName?.trim()).toBeTruthy();
      const colors = await action.evaluate((element) => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, color: style.color };
      });
      expect(colors.color).not.toBe(colors.background);
    }
    await expectNoPageOverflow(page);
  }
});
