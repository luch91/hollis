import { establishRoleSession, expect, test } from "./fixtures";

const apiOrigin = "http://127.0.0.1:4321";
const caseId = "00000000-0000-4000-8000-000000000399";

async function authorization(page: import("@playwright/test").Page) {
  const session = (await page.context().cookies()).find((item) => item.name === "hollis_session");
  expect(session).toBeDefined();
  return { authorization: `Bearer ${session?.value ?? ""}` };
}

test("attestation publication accepts only a case identifier and server-resolves all facts", async ({
  page,
}) => {
  await establishRoleSession(page, "owner");
  const headers = await authorization(page);
  const tampered = await page.request.post(
    `${apiOrigin}/v1/review-cases/${caseId}/attestation-case-files`,
    {
      data: {
        policy: {
          policyId: "attacker-controlled-policy",
          policyVersion: "1",
        },
      },
      headers,
    },
  );
  expect(tampered.status(), await tampered.text()).toBe(400);

  const published = await page.request.post(
    `${apiOrigin}/v1/review-cases/${caseId}/attestation-case-files`,
    { data: {}, headers },
  );
  expect([200, 201]).toContain(published.status());
  const first = await published.json();
  expect(first.caseFile.policy.policyId).toBe("e2e-policy");
  expect(first.caseFile.canonicalRecord).toBeDefined();

  const replay = await page.request.post(
    `${apiOrigin}/v1/review-cases/${caseId}/attestation-case-files`,
    { data: {}, headers },
  );
  expect(replay.status(), await replay.text()).toBe(200);
  expect((await replay.json()).publicId).toBe(first.publicId);
});
