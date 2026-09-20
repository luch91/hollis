import { createHash } from "node:crypto";
import { establishRoleSession, expect, test } from "./fixtures";

const apiOrigin = "http://127.0.0.1:4321";

function digest(bytes: Buffer) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function token(page: import("@playwright/test").Page) {
  const session = (await page.context().cookies()).find((item) => item.name === "hollis_session");
  expect(session).toBeDefined();
  return session?.value ?? "";
}

test("verified downloads remain immutable after a captured upload URL is reused", async ({ page }, testInfo) => {
  await establishRoleSession(page, "owner");
  const authorization = `Bearer ${await token(page)}`;
  const caseId = testInfo.project.name === "chromium-mobile"
    ? "00000000-0000-4000-8000-000000000411"
    : "00000000-0000-4000-8000-000000000410";

  const original = Buffer.from("immutable synthetic evidence\n", "utf8");
  const uploadResponse = await page.request.post(`${apiOrigin}/v1/review-cases/${caseId}/evidence/uploads`, {
    data: { digest: digest(original), mediaType: "text/plain", sizeBytes: original.byteLength },
    headers: { authorization },
  });
  expect(uploadResponse.status(), await uploadResponse.text()).toBe(201);
  const upload = await uploadResponse.json() as { evidenceId: string; uploadUrl: string };
  expect(new URL(upload.uploadUrl).searchParams.get("objectName")).toContain("/evidence/quarantine/");

  expect((await page.request.put(upload.uploadUrl, { data: original, headers: { "content-type": "text/plain" } })).status()).toBe(204);
  expect((await page.request.post(`${apiOrigin}/v1/review-cases/${caseId}/evidence/${upload.evidenceId}/verify`, { headers: { authorization } })).status()).toBe(204);

  const detail = await page.request.get(`${apiOrigin}/v1/review-cases/${caseId}`, { headers: { authorization } });
  expect(detail.ok(), await detail.text()).toBeTruthy();
  const attachment = (await detail.json()).evidence[0] as { id: string };
  const download = await page.request.get(`${apiOrigin}/v1/review-cases/${caseId}/evidence/${attachment.id}/download`, { headers: { authorization } });
  expect(download.ok(), await download.text()).toBeTruthy();
  const initialDownload = await page.request.get((await download.json()).downloadUrl);
  expect(digest(Buffer.from(await initialDownload.body()))).toBe(digest(original));

  const replacement = Buffer.from("attempted replacement", "utf8");
  expect((await page.request.put(upload.uploadUrl, { data: replacement, headers: { "content-type": "text/plain" } })).status()).toBe(204);
  const afterReuse = await page.request.get((await download.json()).downloadUrl);
  expect(digest(Buffer.from(await afterReuse.body()))).toBe(digest(original));
});
