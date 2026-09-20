import axe from "axe-core";
import { establishRoleSession, expect, test, type E2ERole } from "./fixtures";

test("public landing and protected route boundaries", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/app");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("new identity reaches onboarding and welcome email capture", async ({ page }) => {
  await page.goto("/");
  const session = await page.request.post("/api/auth/session", {
    data: { identityToken: "e2e-new-user" },
  });
  expect(session.ok(), await session.text()).toBeTruthy();
  await page.goto("/onboarding");
  await expect(
    page.getByRole("heading", { name: "Create your organization workspace." }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const emails = await page.request.get("http://127.0.0.1:4321/__e2e/emails");
      expect(emails.ok()).toBeTruthy();
      return ((await emails.json()) as unknown[]).length;
    })
    .toBeGreaterThanOrEqual(1);
});

test("session and role controls stay synchronized after refresh and in a second context", async ({
  browser,
  page,
}) => {
  await establishRoleSession(page, "auditor");
  await page.goto("/app/review-cases");
  await expect(page.getByRole("link", { name: "New review case" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("E2E Primary Workspace", { exact: true }).first()).toBeVisible();

  const secondContext = await browser.newContext();
  await secondContext.addCookies(await page.context().cookies());
  const secondPage = await secondContext.newPage();
  await secondPage.goto("http://127.0.0.1:3101/app/review-cases");
  await expect(
    secondPage.getByText("E2E Primary Workspace", { exact: true }).first(),
  ).toBeVisible();
  await expect(secondPage.getByRole("link", { name: "New review case" })).toHaveCount(0);
  await secondContext.close();
});

for (const role of ["owner", "administrator", "reviewer", "contributor", "auditor"] as const) {
  test(`${role} receives its deterministic workspace session`, async ({ page }) => {
    await establishRoleSession(page, role satisfies E2ERole);
    await expect(page.getByText("E2E Primary Workspace", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
  });

  test(`${role} sees only role-permitted actions`, async ({ page }) => {
    await establishRoleSession(page, role satisfies E2ERole);
    await page.goto("/app/review-cases");
    await expect(page.getByRole("link", { name: "New review case" })).toHaveCount(
      role === "auditor" ? 0 : 1,
    );

    await page.goto("/app/review-cases/00000000-0000-4000-8000-000000000397");
    await expect(page.getByRole("button", { name: "Claim for review" })).toHaveCount(
      ["owner", "administrator", "reviewer"].includes(role) ? 1 : 0,
    );

    await page.goto("/app/admin");
    const canManage = role === "owner" || role === "administrator";
    await expect(page.getByRole("heading", { name: "Invite a member" })).toHaveCount(
      canManage ? 1 : 0,
    );
    await expect(page.getByText("Read-only access", { exact: true })).toHaveCount(
      canManage ? 0 : 1,
    );
  });
}

test("tenant identifiers cannot cross the active workspace boundary", async ({ browser, page }) => {
  await establishRoleSession(page, "owner");
  const sessionCookie = (await page.context().cookies()).find(
    (cookie) => cookie.name === "hollis_session",
  );
  expect(sessionCookie).toBeDefined();
  const response = await page.request.get(
    "http://127.0.0.1:4321/v1/review-cases/00000000-0000-4000-8000-000000000299",
    { headers: { authorization: `Bearer ${sessionCookie?.value}` } },
  );
  expect(response.status()).toBe(404);

  const isolatedContext = await browser.newContext();
  await isolatedContext.addCookies(await page.context().cookies());
  const isolatedPage = await isolatedContext.newPage();
  const navigation = await isolatedPage.goto(
    "http://127.0.0.1:3101/app/review-cases/00000000-0000-4000-8000-000000000299",
  );
  expect(navigation?.status()).toBe(404);
  await isolatedContext.close();
});

for (const path of [
  "/",
  "/sign-in",
  "/docs",
  "/app",
  "/app/review-cases",
  "/app/review-cases/00000000-0000-4000-8000-000000000399",
  "/app/policy",
  "/app/admin",
]) {
  test(`@a11y ${path} has no serious or critical automated violations`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    if (path.startsWith("/app")) await establishRoleSession(page, "owner");
    await page.goto(path);
    await page.addScriptTag({ content: axe.source });
    const results = await page.evaluate(async () => {
      const runner = (window as typeof window & { axe: typeof axe }).axe;
      return runner.run(document, { resultTypes: ["violations"] });
    });
    const blocking = results.violations.filter(
      (violation) => violation.impact === "critical" || violation.impact === "serious",
    );
    expect(blocking).toEqual([]);
  });
}
