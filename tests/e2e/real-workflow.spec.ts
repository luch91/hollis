import { expect, test } from "@playwright/test";

function compareUnicodeScalars(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

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

async function independentCommitment(record: unknown) {
  const bytes = new TextEncoder().encode(`hollis.case-commitment.v1\n${canonicalJson(record)}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Buffer.from(digest).toString("hex")}`;
}

test("approved environment identity and primary application workflow", async ({ page }) => {
  const identityToken = process.env.HOLLIS_E2E_REAL_IDENTITY_TOKEN;
  const caseId = process.env.HOLLIS_E2E_REAL_REVIEW_CASE_ID;
  const workspaceName = process.env.HOLLIS_E2E_REAL_WORKSPACE_NAME;
  if (!identityToken || !caseId || !workspaceName) {
    throw new Error("Real workflow credentials and isolated test identifiers are required.");
  }

  await page.goto("/");
  const session = await page.request.post("/api/auth/session", {
    data: { identityToken },
  });
  expect(session.ok(), await session.text()).toBeTruthy();
  const body = (await session.json()) as { activeWorkspace: unknown };
  expect(body.activeWorkspace).toBeTruthy();

  for (const path of ["/app", "/app/review-cases", "/app/policy", "/app/admin", "/app/profile"]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByText(workspaceName, { exact: true }).first()).toBeVisible();
  }

  await page.goto(`/app/review-cases/${caseId}`);
  await page.getByRole("button", { name: "Claim for review" }).click();
  await expect(page.getByRole("heading", { name: "Record decision" })).toBeVisible();
  await page.getByLabel("Outcome").selectOption("modified");
  await page.getByLabel("Final recommendation").selectOption("refer");
  await page
    .getByLabel("Rationale")
    .fill("Approved non-production workflow verified the synthetic evidence and policy binding.");
  await page.getByRole("button", { name: "Record human decision" }).click();
  await expect(page.getByText("completed", { exact: true })).toBeVisible();

  const exportUrl = `/app/review-cases/${caseId}/export?format=json`;
  const firstExport = await page.request.get(exportUrl);
  expect(firstExport.ok(), await firstExport.text()).toBeTruthy();
  const first = await firstExport.json();
  expect(first.canonical.commitmentVersion).toBe("hollis.case-commitment.v1");
  expect(await independentCommitment(first.canonical.record)).toBe(first.canonical.caseCommitment);

  const signOut = await page.request.delete("/api/auth/session");
  expect(signOut.status()).toBe(204);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/sign-in/);

  const secondSession = await page.request.post("/api/auth/session", {
    data: { identityToken },
  });
  expect(secondSession.ok(), await secondSession.text()).toBeTruthy();
  const secondExport = await page.request.get(exportUrl);
  expect(secondExport.ok(), await secondExport.text()).toBeTruthy();
  const second = await secondExport.json();
  expect(first.canonical).toEqual(second.canonical);

  await page.goto(`/app/review-cases/${caseId}`);
  const summary = page.getByTestId("case-commitment-summary");
  await expect(summary).toContainText(first.canonical.commitmentVersion);
  await expect(summary).toContainText(first.canonical.caseCommitment);
  await expect(page.getByTestId("attestation-case-commitment")).toContainText(
    first.canonical.caseCommitment,
  );

  const finalSignOut = await page.request.delete("/api/auth/session");
  expect(finalSignOut.status()).toBe(204);
});
