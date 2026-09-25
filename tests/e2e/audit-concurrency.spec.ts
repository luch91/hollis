import { establishRoleSession, expect, test } from "./fixtures";

const apiOrigin = "http://127.0.0.1:4321";
async function authorization(page: import("@playwright/test").Page) {
  const session = (await page.context().cookies()).find((item) => item.name === "hollis_session");
  expect(session).toBeDefined();
  return { authorization: `Bearer ${session?.value ?? ""}` };
}

test("concurrent claim attempts produce one linear case audit chain", async ({
  browser,
}, testInfo) => {
  const caseId =
    testInfo.project.name === "chromium-mobile"
      ? "00000000-0000-4000-8000-000000000420"
      : "00000000-0000-4000-8000-000000000419";
  const [ownerContext, reviewerContext] = await Promise.all([
    browser.newContext({ baseURL: "http://127.0.0.1:3101" }),
    browser.newContext({ baseURL: "http://127.0.0.1:3101" }),
  ]);
  const [owner, reviewer] = await Promise.all([ownerContext.newPage(), reviewerContext.newPage()]);
  try {
    await Promise.all([
      establishRoleSession(owner, "owner"),
      establishRoleSession(reviewer, "reviewer"),
    ]);
    const [ownerHeaders, reviewerHeaders] = await Promise.all([
      authorization(owner),
      authorization(reviewer),
    ]);
    const [first, second] = await Promise.all([
      owner.request.post(`${apiOrigin}/v1/review-cases/${caseId}/claim`, { headers: ownerHeaders }),
      reviewer.request.post(`${apiOrigin}/v1/review-cases/${caseId}/claim`, {
        headers: reviewerHeaders,
      }),
    ]);
    expect([first.status(), second.status()].sort()).toEqual([200, 409]);

    const exported = await owner.request.get(`${apiOrigin}/v1/review-cases/${caseId}/export`, {
      headers: ownerHeaders,
    });
    expect(exported.ok(), await exported.text()).toBeTruthy();
    const exportedRecord = (await exported.json()) as {
      auditIntegrity?: { status: string };
      events: Array<{
        eventHash: string;
        eventSequence: number;
        previousHash: string | null;
      }>;
    };
    const events = exportedRecord.events;
    expect(events).toHaveLength(2);
    expect(events[0]?.previousHash).toBeNull();
    expect(events[1]?.previousHash).toBe(events[0]?.eventHash);
    expect(events.map((event) => event.eventSequence)).toEqual(
      [...events.map((event) => event.eventSequence)].sort((a, b) => a - b),
    );
    expect(exportedRecord.auditIntegrity).toEqual(expect.objectContaining({ status: "verified" }));
    await owner.goto(`/app/review-cases/${caseId}`);
    await expect(owner.getByTestId("audit-integrity-status")).toContainText("Audit chain verified");
  } finally {
    await Promise.all([ownerContext.close(), reviewerContext.close()]);
  }
});
