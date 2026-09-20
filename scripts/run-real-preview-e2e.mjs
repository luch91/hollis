import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));

const apiOrigin = "https://hollis-api-git-audit-task-02-03-oluchi-judiths-projects.vercel.app";
const webOrigin = "https://hollis-git-audit-task-02-03-oluchi-judiths-projects.vercel.app";
const apiKey = process.env.NEXT_PUBLIC_IDENTITY_PLATFORM_API_KEY;
const email = process.env.HOLLIS_E2E_TEST_EMAIL;
const password = process.env.HOLLIS_E2E_TEST_PASSWORD;

if (!apiKey || !email || !password) {
  throw new Error("Preview identity test credentials are not configured.");
}

async function request(url, init = {}) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(
      `${init.method ?? "GET"} ${new URL(url).pathname} failed with ${response.status}: ${await response.text()}`,
    );
  }
  return response.status === 204 ? null : response.json();
}

const signIn = await request(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  },
);
const identityToken = signIn.idToken;
const session = await request(`${apiOrigin}/v1/auth/sessions`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ identityToken }),
});
const authorization = { authorization: `Bearer ${session.sessionToken}` };
const suffix = randomUUID();
const workspaceName = `Hollis Preview Evidence E2E ${suffix}`;
await request(`${apiOrigin}/v1/workspaces`, {
  method: "POST",
  headers: { ...authorization, "content-type": "application/json" },
  body: JSON.stringify({ name: workspaceName }),
});

const policyContent = Buffer.from(
  "# Preview evidence workflow\n\nVerified evidence is required before a decision.\n",
);
const source = await request(`${apiOrigin}/v1/policy-source`, {
  method: "PUT",
  headers: {
    ...authorization,
    "content-type": "text/markdown",
    "x-hollis-policy-source-name": "preview-evidence-workflow.md",
  },
  body: policyContent,
});
const policyId = `preview-evidence-${suffix.slice(0, 8)}`;
await request(`${apiOrigin}/v1/policies`, {
  method: "POST",
  headers: { ...authorization, "content-type": "application/json" },
  body: JSON.stringify({
    controls: [
      {
        attestationCriterion: "Evidence must be verified before the review decision.",
        controlId: "verified-evidence",
        controlVersion: "1",
        evidenceRequirement: "verified_reference_required",
        interpretation: "deterministic",
        title: "Verified evidence",
      },
    ],
    documentDigest: source.digest,
    policyId,
    title: "Preview evidence workflow",
    source: { fileName: source.fileName, mediaType: source.mediaType, sizeBytes: source.sizeBytes },
    version: "1",
  }),
});
const caseRecord = await request(`${apiOrigin}/v1/review-cases`, {
  method: "POST",
  headers: { ...authorization, "content-type": "application/json" },
  body: JSON.stringify({
    automatedSystemVersion: "preview-e2e",
    evidence: [
      {
        digest: `sha256:${"0".repeat(64)}`,
        id: "intake-placeholder",
        mediaType: "text/plain",
      },
    ],
    externalReference: `preview-e2e-${suffix}`,
    policyId,
    policyVersion: "1",
    recommendation: "refer",
    riskLevel: "low",
    reviewDueAt: new Date(Date.now() + 86_400_000).toISOString(),
    ruleId: "verified-evidence",
  }),
});

console.log(
  `Prepared isolated preview workflow: workspace=${workspaceName}; case=${caseRecord.id}`,
);
const result = spawnSync("pnpm.cmd", ["e2e:real"], {
  stdio: "inherit",
  env: {
    ...process.env,
    HOLLIS_E2E_APPROVED_ENVIRONMENT: "staging",
    HOLLIS_E2E_REAL_ALLOWED_ORIGIN: webOrigin,
    HOLLIS_E2E_REAL_API_ORIGIN: apiOrigin,
    HOLLIS_E2E_REAL_IDENTITY_TOKEN: identityToken,
    HOLLIS_E2E_REAL_REVIEW_CASE_ID: caseRecord.id,
    HOLLIS_E2E_REAL_WEB_ORIGIN: webOrigin,
    HOLLIS_E2E_REAL_WORKSPACE_NAME: workspaceName,
  },
});
process.exit(result.status ?? 1);
