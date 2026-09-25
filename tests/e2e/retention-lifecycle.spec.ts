import { establishRoleSession, expect, test } from "./fixtures";

const apiOrigin = "http://127.0.0.1:4321";
const caseId = "00000000-0000-4000-8000-000000000399";

async function authorization(page: import("@playwright/test").Page) {
  const session = (await page.context().cookies()).find((item) => item.name === "hollis_session");
  expect(session).toBeDefined();
  return { authorization: `Bearer ${session?.value ?? ""}` };
}

test("legal hold state is server-authorized and auditable", async ({ browser }) => {
  const [ownerContext, contributorContext] = await Promise.all([
    browser.newContext({ baseURL: "http://127.0.0.1:3101" }),
    browser.newContext({ baseURL: "http://127.0.0.1:3101" }),
  ]);
  const [owner, contributor] = await Promise.all([
    ownerContext.newPage(),
    contributorContext.newPage(),
  ]);
  try {
    await Promise.all([
      establishRoleSession(owner, "owner"),
      establishRoleSession(contributor, "contributor"),
    ]);
    const [ownerHeaders, contributorHeaders] = await Promise.all([
      authorization(owner),
      authorization(contributor),
    ]);
    const evidenceId = "00000000-0000-4000-8000-000000000390";

    // The local harness deliberately preserves its synthetic database across
    // Playwright retries. Record the starting point so this workflow asserts
    // the two state changes it performed, rather than historical retry data.
    const initialExport = await owner.request.get(`${apiOrigin}/v1/review-cases/${caseId}/export`, {
      headers: ownerHeaders,
    });
    expect(initialExport.ok(), await initialExport.text()).toBeTruthy();
    const initialEvents = (await initialExport.json()).events as Array<{
      eventType: string;
      payload: unknown;
    }>;
    const initialHoldEventCount = initialEvents.filter(
      (event) => event.eventType === "legal_hold_changed",
    ).length;

    const forbidden = await contributor.request.post(
      `${apiOrigin}/v1/review-cases/${caseId}/evidence/${evidenceId}/legal-hold`,
      { data: { active: true }, headers: contributorHeaders },
    );
    expect(forbidden.status(), await forbidden.text()).toBe(403);

    const held = await owner.request.post(
      `${apiOrigin}/v1/review-cases/${caseId}/evidence/${evidenceId}/legal-hold`,
      { data: { active: true }, headers: ownerHeaders },
    );
    expect(held.status(), await held.text()).toBe(204);
    const released = await owner.request.post(
      `${apiOrigin}/v1/review-cases/${caseId}/evidence/${evidenceId}/legal-hold`,
      { data: { active: false }, headers: ownerHeaders },
    );
    expect(released.status(), await released.text()).toBe(204);

    const exported = await owner.request.get(`${apiOrigin}/v1/review-cases/${caseId}/export`, {
      headers: ownerHeaders,
    });
    expect(exported.ok(), await exported.text()).toBeTruthy();
    const events = (await exported.json()).events as Array<{ eventType: string; payload: unknown }>;
    const holdEvents = events.filter((event) => event.eventType === "legal_hold_changed");
    expect(holdEvents).toHaveLength(initialHoldEventCount + 2);
    expect(holdEvents.slice(-2).map((event) => event.payload)).toEqual([
      expect.objectContaining({ active: true, evidenceId }),
      expect.objectContaining({ active: false, evidenceId }),
    ]);

    await owner.goto(`/app/review-cases/${caseId}`);
    await expect(
      owner.getByRole("heading", { name: "Evidence references and retention" }),
    ).toBeVisible();
    await expect(owner.getByText(/legal hold none/i)).toBeVisible();
    await expect(owner.getByText(/retention until:/i)).toBeVisible();
    await expect(
      owner.getByRole("checkbox", { name: /I understand this places a legal hold/i }),
    ).toBeVisible();
  } finally {
    await Promise.all([ownerContext.close(), contributorContext.close()]);
  }
});
