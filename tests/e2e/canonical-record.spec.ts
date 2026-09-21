import { establishRoleSession, expect, test } from "./fixtures";

const caseId = "00000000-0000-4000-8000-000000000399";
const desktopWorkflowCaseId = "00000000-0000-4000-8000-000000000396";
const mobileWorkflowCaseId = "00000000-0000-4000-8000-000000000393";
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => compareUnicodeScalars(left, right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  throw new TypeError("Unsupported canonical JSON value.");
}

function compareUnicodeScalars(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

async function independentCommitment(record: unknown) {
  const input = new TextEncoder().encode(`hollis.case-commitment.v1\n${canonicalJson(record)}`);
  return `sha256:${Buffer.from(await crypto.subtle.digest("SHA-256", input)).toString("hex")}`;
}

async function sessionToken(page: import("@playwright/test").Page) {
  const cookie = (await page.context().cookies()).find((item) => item.name === "hollis_session");
  expect(cookie).toBeDefined();
  return cookie?.value ?? "";
}

test("completed workflow produces a deterministic canonical export", async ({ page }, testInfo) => {
  const workflowCaseId =
    testInfo.project.name === "chromium-mobile" ? mobileWorkflowCaseId : desktopWorkflowCaseId;
  await establishRoleSession(page, "owner");
  const closeTour = page.getByRole("button", { name: "Close tour" });
  if (await closeTour.isVisible()) await closeTour.click();
  await page.goto(`/app/review-cases/${workflowCaseId}`);
  await page.getByRole("button", { name: "Claim for review" }).click();
  await expect(page.getByRole("heading", { name: "Record decision" })).toBeVisible();
  await page.getByLabel("Outcome").selectOption("modified");
  await page.getByLabel("Final recommendation").selectOption("refer");
  await page
    .getByLabel("Rationale")
    .fill("Synthetic reviewer verified the evidence and modified the recommendation.");
  await page
    .getByLabel("Known limitations")
    .fill(
      "The supplied evidence is complete but does not independently prove every underlying fact.",
    );
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Record human decision" }).click();
  await expect(page.getByText("completed", { exact: true })).toBeVisible();

  const token = await sessionToken(page);
  const headers = { authorization: `Bearer ${token}` };
  const first = await page.request.get(
    `http://127.0.0.1:4321/v1/review-cases/${workflowCaseId}/export`,
    { headers },
  );
  const second = await page.request.get(
    `http://127.0.0.1:4321/v1/review-cases/${workflowCaseId}/export`,
    { headers },
  );
  expect(first.ok(), await first.text()).toBeTruthy();
  expect(second.ok(), await second.text()).toBeTruthy();
  const firstBody = await first.json();
  expect(firstBody.canonical).toEqual((await second.json()).canonical);
  expect(await independentCommitment(firstBody.canonical.record)).toBe(
    firstBody.canonical.caseCommitment,
  );
  await page.reload();
  const attestationCommitment = page.getByTestId("attestation-case-commitment");
  await expect(attestationCommitment).toContainText(firstBody.canonical.commitmentVersion);
  await expect(attestationCommitment).toContainText(firstBody.canonical.caseCommitment);
});

test("canonical commitment is deterministic across export and UI", async ({ page }) => {
  await establishRoleSession(page, "owner");
  const token = await sessionToken(page);
  const headers = { authorization: `Bearer ${token}` };
  const first = await page.request.get(`http://127.0.0.1:4321/v1/review-cases/${caseId}/export`, {
    headers,
  });
  const second = await page.request.get(`http://127.0.0.1:4321/v1/review-cases/${caseId}/export`, {
    headers,
  });
  expect(first.ok(), await first.text()).toBeTruthy();
  expect(second.ok(), await second.text()).toBeTruthy();
  const firstExport = await first.json();
  const secondExport = await second.json();
  expect(firstExport.canonical).toEqual(secondExport.canonical);
  expect(firstExport.canonical.commitmentVersion).toBe("hollis.case-commitment.v1");
  expect(await independentCommitment(firstExport.canonical.record)).toBe(
    firstExport.canonical.caseCommitment,
  );
  expect(firstExport.canonical.record.evidence).toEqual([
    {
      digest: `sha256:${"a".repeat(64)}`,
      mediaType: "application/json",
      verified: true,
    },
  ]);

  await page.goto(`/app/review-cases?caseId=${caseId}&tab=history`);
  const summary = page.getByTestId("case-commitment-summary");
  await expect(summary).toContainText("hollis.case-commitment.v1");
  await expect(summary).toContainText(firstExport.canonical.caseCommitment);
});

test("legacy public case files are explicitly versioned as legacy", async ({ page }) => {
  await establishRoleSession(page, "owner");
  await page.goto(
    `/app/review-cases/${caseId}/attestation-case-files/00000000-0000-4000-8000-000000000394`,
  );
  await expect(
    page.getByText("Legacy: hollis.adjudication-case.v1 manifest", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(`sha256:${"d".repeat(64)}`, { exact: true }).first()).toBeVisible();
});

test("public case file and authenticated export use the same commitment", async ({ page }) => {
  await establishRoleSession(page, "owner");
  const token = await sessionToken(page);
  const headers = { authorization: `Bearer ${token}` };
  const exported = await page.request.get(
    `http://127.0.0.1:4321/v1/review-cases/${caseId}/export`,
    { headers },
  );
  const exportBody = await exported.json();
  const publication = await page.request.post(
    `http://127.0.0.1:4321/v1/review-cases/${caseId}/attestation-case-files`,
    { data: {}, headers },
  );
  expect([200, 201]).toContain(publication.status());
  const published = await publication.json();
  expect(published.caseFile.caseCommitment).toBe(exportBody.canonical.caseCommitment);
  expect(published.caseFile.canonicalRecord).toEqual(exportBody.canonical.record);
  const afterPublication = await page.request.get(
    `http://127.0.0.1:4321/v1/review-cases/${caseId}/export`,
    { headers },
  );
  expect(afterPublication.ok(), await afterPublication.text()).toBeTruthy();
  expect((await afterPublication.json()).canonical).toEqual(exportBody.canonical);

  await page.goto(`/app/review-cases/${caseId}/attestation-case-files/${published.publicId}`);
  await expect(page.getByText("hollis.case-commitment.v1", { exact: true })).toBeVisible();
  await expect(page.getByText(exportBody.canonical.caseCommitment, { exact: true })).toBeVisible();
});

test("completed commitment-bound fields cannot be changed", async ({ page }) => {
  await establishRoleSession(page, "owner");
  await page.goto(`/app/review-cases/${caseId}`);
  await expect(page.getByRole("link", { name: "Add evidence" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Add evidence" })).toHaveCount(0);

  const token = await sessionToken(page);
  const response = await page.request.post(
    `http://127.0.0.1:4321/v1/review-cases/${caseId}/evidence/uploads`,
    {
      data: {
        digest: `sha256:${"f".repeat(64)}`,
        mediaType: "application/json",
        sizeBytes: 10,
      },
      headers: { authorization: `Bearer ${token}` },
    },
  );
  expect(response.status()).toBe(409);
});
