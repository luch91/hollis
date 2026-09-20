import { createHash } from "node:crypto";
import { establishRoleSession, expect, test } from "./fixtures";

const apiOrigin = "http://127.0.0.1:4321";
const hash = (value: Buffer) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

async function sessionAuthorization(page: import("@playwright/test").Page) {
  const session = (await page.context().cookies()).find((item) => item.name === "hollis_session");
  return `Bearer ${session?.value ?? ""}`;
}

test("attachments are case-scoped, idempotent, ordered, and frozen at claim", async ({ page }, testInfo) => {
  await establishRoleSession(page, "owner");
  const authorization = await sessionAuthorization(page);
  const caseId = testInfo.project.name === "chromium-mobile"
    ? "00000000-0000-4000-8000-000000000413"
    : "00000000-0000-4000-8000-000000000412";
  const bytes = [Buffer.from("first ledger item"), Buffer.from("second ledger item")];
  for (const item of bytes) {
    const upload = await page.request.post(`${apiOrigin}/v1/review-cases/${caseId}/evidence/uploads`, {
      data: { digest: hash(item), mediaType: "text/plain", sizeBytes: item.byteLength },
      headers: { authorization },
    });
    expect(upload.status(), await upload.text()).toBe(201);
    const record = await upload.json() as { evidenceId: string; uploadUrl: string };
    expect((await page.request.put(record.uploadUrl, { data: item, headers: { "content-type": "text/plain" } })).status()).toBe(204);
    expect((await page.request.post(`${apiOrigin}/v1/review-cases/${caseId}/evidence/${record.evidenceId}/verify`, { headers: { authorization } })).status()).toBe(204);
  }
  const detail = await page.request.get(`${apiOrigin}/v1/review-cases/${caseId}`, { headers: { authorization } });
  const body = await detail.json() as { evidence: Array<{ digest: string; id: string }> };
  expect(body.evidence.map((item) => item.digest)).toEqual(bytes.map(hash));

  const retry = await page.request.post(`${apiOrigin}/v1/review-cases/${caseId}/evidence/uploads`, {
    data: { digest: hash(bytes[0]), mediaType: "text/plain", sizeBytes: bytes[0].byteLength },
    headers: { authorization },
  });
  expect(retry.status(), await retry.text()).toBe(201);
  const retryRecord = await retry.json() as { evidenceId: string; uploadUrl: string };
  expect((await page.request.put(retryRecord.uploadUrl, { data: bytes[0], headers: { "content-type": "text/plain" } })).status()).toBe(204);
  expect((await page.request.post(`${apiOrigin}/v1/review-cases/${caseId}/evidence/${retryRecord.evidenceId}/verify`, { headers: { authorization } })).status()).toBe(204);
  const afterRetry = await page.request.get(`${apiOrigin}/v1/review-cases/${caseId}`, { headers: { authorization } });
  expect((await afterRetry.json()).evidence.map((item: { digest: string }) => item.digest)).toEqual(bytes.map(hash));

  const independentCaseId = testInfo.project.name === "chromium-mobile"
    ? "00000000-0000-4000-8000-000000000410"
    : "00000000-0000-4000-8000-000000000411";
  const independentUpload = await page.request.post(`${apiOrigin}/v1/review-cases/${independentCaseId}/evidence/uploads`, {
    data: { digest: hash(bytes[0]), mediaType: "text/plain", sizeBytes: bytes[0].byteLength },
    headers: { authorization },
  });
  expect(independentUpload.status(), await independentUpload.text()).toBe(201);
  const independentRecord = await independentUpload.json() as { evidenceId: string; uploadUrl: string };
  expect((await page.request.put(independentRecord.uploadUrl, { data: bytes[0], headers: { "content-type": "text/plain" } })).status()).toBe(204);
  expect((await page.request.post(`${apiOrigin}/v1/review-cases/${independentCaseId}/evidence/${independentRecord.evidenceId}/verify`, { headers: { authorization } })).status()).toBe(204);
  const independentDetail = await page.request.get(`${apiOrigin}/v1/review-cases/${independentCaseId}`, { headers: { authorization } });
  expect((await independentDetail.json()).evidence.some((item: { digest: string }) => item.digest === hash(bytes[0]))).toBe(true);

  expect((await page.request.post(`${apiOrigin}/v1/review-cases/${caseId}/claim`, { headers: { authorization } })).status()).toBe(200);
  expect((await page.request.delete(`${apiOrigin}/v1/review-cases/${caseId}/evidence/${body.evidence[0]?.id}`, { headers: { authorization } })).status()).toBe(409);
  const afterFreeze = await page.request.get(`${apiOrigin}/v1/review-cases/${caseId}`, { headers: { authorization } });
  expect((await afterFreeze.json()).evidence.map((item: { digest: string }) => item.digest)).toEqual(bytes.map(hash));
});
