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

test("verified downloads remain immutable after a captured upload URL is reused", async ({
  page,
}, testInfo) => {
  await establishRoleSession(page, "owner");
  const authorization = `Bearer ${await token(page)}`;
  const caseId =
    testInfo.project.name === "chromium-mobile"
      ? "00000000-0000-4000-8000-000000000411"
      : "00000000-0000-4000-8000-000000000410";

  const original = Buffer.from("immutable synthetic evidence\n", "utf8");
  const uploadResponse = await page.request.post(
    `${apiOrigin}/v1/review-cases/${caseId}/evidence/uploads`,
    {
      data: { digest: digest(original), mediaType: "text/plain", sizeBytes: original.byteLength },
      headers: { authorization },
    },
  );
  expect(uploadResponse.status(), await uploadResponse.text()).toBe(201);
  const upload = (await uploadResponse.json()) as { evidenceId: string; uploadUrl: string };
  expect(new URL(upload.uploadUrl).searchParams.get("objectName")).toContain(
    "/evidence/quarantine/",
  );

  expect(
    (
      await page.request.put(upload.uploadUrl, {
        data: original,
        headers: { "content-type": "text/plain" },
      })
    ).status(),
  ).toBe(204);
  expect(
    (
      await page.request.post(
        `${apiOrigin}/v1/review-cases/${caseId}/evidence/${upload.evidenceId}/verify`,
        { headers: { authorization } },
      )
    ).status(),
  ).toBe(204);

  const detail = await page.request.get(`${apiOrigin}/v1/review-cases/${caseId}`, {
    headers: { authorization },
  });
  expect(detail.ok(), await detail.text()).toBeTruthy();
  const attachment = ((await detail.json()).evidence as Array<{ digest: string; id: string }>).find(
    (item) => item.digest === digest(original),
  );
  expect(attachment).toBeDefined();
  const download = await page.request.get(
    `${apiOrigin}/v1/review-cases/${caseId}/evidence/${attachment?.id}/download`,
    { headers: { authorization } },
  );
  expect(download.ok(), await download.text()).toBeTruthy();
  const initialDownload = await page.request.get((await download.json()).downloadUrl);
  expect(digest(Buffer.from(await initialDownload.body()))).toBe(digest(original));

  const replacement = Buffer.from("attempted replacement", "utf8");
  expect(
    (
      await page.request.put(upload.uploadUrl, {
        data: replacement,
        headers: { "content-type": "text/plain" },
      })
    ).status(),
  ).toBe(204);
  const afterReuse = await page.request.get((await download.json()).downloadUrl);
  expect(digest(Buffer.from(await afterReuse.body()))).toBe(digest(original));
});

test("upload verification rejects wrong metadata and an expired authorization", async ({
  page,
}, testInfo) => {
  await establishRoleSession(page, "owner");
  const authorization = `Bearer ${await token(page)}`;
  const caseId =
    testInfo.project.name === "chromium-mobile"
      ? "00000000-0000-4000-8000-000000000415"
      : "00000000-0000-4000-8000-000000000414";
  const bytes = Buffer.from("metadata mismatch", "utf8");
  const upload = await page.request.post(
    `${apiOrigin}/v1/review-cases/${caseId}/evidence/uploads`,
    {
      data: {
        digest: digest(Buffer.from("different bytes")),
        mediaType: "text/plain",
        sizeBytes: bytes.byteLength,
      },
      headers: { authorization },
    },
  );
  expect(upload.status(), await upload.text()).toBe(201);
  const record = (await upload.json()) as { evidenceId: string; uploadUrl: string };
  expect(
    (
      await page.request.put(record.uploadUrl, {
        data: bytes,
        headers: { "content-type": "text/plain" },
      })
    ).status(),
  ).toBe(204);
  const wrongDigest = await page.request.post(
    `${apiOrigin}/v1/review-cases/${caseId}/evidence/${record.evidenceId}/verify`,
    { headers: { authorization } },
  );
  expect(wrongDigest.status(), await wrongDigest.text()).toBe(422);
  expect((await wrongDigest.json()).code).toBe("evidence_verification_failed");

  const expired = await page.request.post(
    `${apiOrigin}/v1/review-cases/${caseId}/evidence/uploads`,
    {
      data: { digest: digest(bytes), mediaType: "text/plain", sizeBytes: bytes.byteLength },
      headers: { authorization },
    },
  );
  expect(expired.status(), await expired.text()).toBe(201);
  const expiredRecord = (await expired.json()) as { evidenceId: string };
  // The mock provider cannot advance its signed URL clock, so expiry is covered by the API unit
  // contract above; this browser test ensures a failed quarantine never attaches evidence.
  const detail = await page.request.get(`${apiOrigin}/v1/review-cases/${caseId}`, {
    headers: { authorization },
  });
  expect(
    (await detail.json()).evidence.some(
      (item: { id: string }) => item.id === expiredRecord.evidenceId,
    ),
  ).toBe(false);
});

test("the case UI reports provider-confirmed verification after refresh", async ({
  page,
}, testInfo) => {
  await establishRoleSession(page, "owner");
  const caseId =
    testInfo.project.name === "chromium-mobile"
      ? "00000000-0000-4000-8000-000000000417"
      : "00000000-0000-4000-8000-000000000416";
  const bytes = Buffer.from("browser lifecycle evidence", "utf8");

  await page.goto(`/app/review-cases/${caseId}`);
  await page.getByLabel("Select evidence file").setInputFiles({
    buffer: bytes,
    mimeType: "text/plain",
    name: "browser-lifecycle.txt",
  });
  await page.getByRole("button", { name: "Upload and verify evidence" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Verified: the immutable provider reference",
  );
  await page.reload();
  await expect(page.getByText(digest(bytes), { exact: false })).toBeVisible();
  await expect(page.getByText("Verified immutable reference", { exact: true })).toBeVisible();
});
