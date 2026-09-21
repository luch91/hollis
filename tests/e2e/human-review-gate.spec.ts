import { createHash } from "node:crypto";
import { establishRoleSession, expect, test } from "./fixtures";

const apiOrigin = "http://127.0.0.1:4321";
const caseIds = {
  "chromium-desktop": "00000000-0000-4000-8000-000000000397",
  "chromium-mobile": "00000000-0000-4000-8000-000000000400",
} as const;

function digest(bytes: Buffer) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function authorization(page: import("@playwright/test").Page) {
  const session = (await page.context().cookies()).find((item) => item.name === "hollis_session");
  expect(session).toBeDefined();
  return { authorization: `Bearer ${session?.value ?? ""}` };
}

test("a reviewer must acknowledge the frozen, policy-bound decision packet before completion", async ({
  page,
}, testInfo) => {
  const caseId = caseIds[testInfo.project.name as keyof typeof caseIds];
  if (!caseId) throw new Error(`No isolated review case for ${testInfo.project.name}.`);
  await establishRoleSession(page, "owner");
  const headers = await authorization(page);
  const bytes = Buffer.from("decision-packet evidence", "utf8");
  const upload = await page.request.post(
    `${apiOrigin}/v1/review-cases/${caseId}/evidence/uploads`,
    {
      data: { digest: digest(bytes), mediaType: "text/plain", sizeBytes: bytes.byteLength },
      headers,
    },
  );
  expect(upload.status(), await upload.text()).toBe(201);
  const evidence = (await upload.json()) as { evidenceId: string; uploadUrl: string };
  expect(
    (
      await page.request.put(evidence.uploadUrl, {
        data: bytes,
        headers: { "content-type": "text/plain" },
      })
    ).status(),
  ).toBe(204);
  expect(
    (
      await page.request.post(
        `${apiOrigin}/v1/review-cases/${caseId}/evidence/${evidence.evidenceId}/verify`,
        {
          headers,
        },
      )
    ).status(),
  ).toBe(204);
  expect(
    (await page.request.post(`${apiOrigin}/v1/review-cases/${caseId}/claim`, { headers })).status(),
  ).toBe(200);

  const decision = {
    finalRecommendation: "deny",
    knownLimitations:
      "Evidence is limited to the submitted artifact and does not include third-party corroboration.",
    outcome: "rejected",
    rationale: "The reviewer rejected the recommendation after reviewing the immutable evidence.",
  };
  const beforeAcknowledgement = await page.request.post(
    `${apiOrigin}/v1/review-cases/${caseId}/decision`,
    { data: decision, headers },
  );
  expect(beforeAcknowledgement.status(), await beforeAcknowledgement.text()).toBe(409);

  const acknowledgement = await page.request.post(
    `${apiOrigin}/v1/review-cases/${caseId}/decision-packet/acknowledgements`,
    { data: { knownLimitations: decision.knownLimitations }, headers },
  );
  expect(acknowledgement.ok(), await acknowledgement.text()).toBeTruthy();
  expect((await acknowledgement.json()).packetDigest).toMatch(/^sha256:[a-f0-9]{64}$/);

  const completed = await page.request.post(`${apiOrigin}/v1/review-cases/${caseId}/decision`, {
    data: decision,
    headers,
  });
  expect(completed.ok(), await completed.text()).toBeTruthy();
  await page.goto(`/app/review-cases/${caseId}`);
  await expect(page.getByRole("heading", { name: "Recorded human decision" })).toBeVisible();
  await expect(
    page.getByText(`Known limitations: ${decision.knownLimitations}`, { exact: true }),
  ).toBeVisible();

  const exported = await page.request.get(`${apiOrigin}/v1/review-cases/${caseId}/export`, {
    headers,
  });
  expect(exported.ok(), await exported.text()).toBeTruthy();
  const events = (await exported.json()).events as Array<{ eventType: string; payload: unknown }>;
  expect(events.map((event) => event.eventType)).toContain("decision_packet_acknowledged");
  expect(events.find((event) => event.eventType === "decision_recorded")?.payload).toMatchObject({
    knownLimitations: decision.knownLimitations,
  });
});
