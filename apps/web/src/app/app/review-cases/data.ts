import type { ReviewExport } from "@hollis/contracts/review-case";
import { redirect } from "next/navigation";
import { readHollisSessionToken } from "@/lib/hollis-session";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type ReviewQueueItem = {
  assignedToUserId: string | null;
  createdAt: string;
  externalReference: string;
  hollisCaseReference: string;
  id: string;
  recommendation: "approve" | "partial_approve" | "deny" | "refer" | "investigate";
  reviewDueAt: string | null;
  riskLevel: "low" | "medium" | "high" | "critical";
  status: "pending" | "in_review" | "escalated" | "completed";
};

export type ReviewCaseDetail = ReviewQueueItem & {
  assignedAt: string | null;
  automatedSystemVersion: string;
  decisionOutcome: "approved" | "modified" | "rejected" | null;
  decisionRationale: string | null;
  decidedAt: string | null;
  decidedByUserId: string | null;
  escalationReason: string | null;
  escalatedAt: string | null;
  escalatedByUserId: string | null;
  evidence: Array<{ digest: string; id: string; mediaType: string }>;
  finalRecommendation: ReviewQueueItem["recommendation"] | null;
  policyVersion: string;
  recommendation: ReviewQueueItem["recommendation"];
  riskLevel: ReviewQueueItem["riskLevel"];
  ruleId: string;
};

export type AttestationRecord = {
  caseCommitment: string;
  contractAddress: string;
  createdAt: string;
  id: string;
  provider: "genlayer";
  providerSubmissionId: string;
  publicCaseFileUrl: string;
  status: "submitted" | "accepted" | "appealed" | "finalized" | "failed" | "undetermined";
  transactionHash: string | null;
  updatedAt: string;
  verdict: "pass" | "fail" | "needs_review" | "undetermined" | null;
};

export type PublicAttestationCaseFile = {
  caseFile: {
    caseCommitment: string;
    policy: {
      control: {
        attestationCriterion: string;
        controlId: string;
        controlVersion: string;
        evidenceRequirement: "none" | "reference_required" | "verified_reference_required";
        interpretation: "deterministic" | "judgment_required";
        policyDocumentDigest: string;
      };
      policyId: string;
      policyVersion: string;
    };
  };
  createdAt: string;
  publicCaseFileUrl: string;
  publicId: string;
};

export type WorkspacePolicy = {
  controls: Array<{
    attestationCriterion: string;
    controlId: string;
    controlVersion: string;
    evidenceRequirement: "none" | "reference_required" | "verified_reference_required";
    interpretation: "deterministic" | "judgment_required";
    title: string;
  }>;
  createdAt: string;
  createdByUserId: string;
  documentDigest: string;
  id: string;
  policyId: string;
  publishedAt: string;
  title: string;
  version: string;
};

type AttestationPolicy = {
  control: PublicAttestationCaseFile["caseFile"]["policy"]["control"];
  policyId: string;
  policyVersion: string;
};

export class ReviewServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
  ) {
    super("The review service could not complete the request.");
    this.name = "ReviewServiceError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const sessionToken = await readHollisSessionToken();
  if (!sessionToken) redirect("/sign-in");
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${sessionToken}`);
  if (init?.body) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers,
  });

  if (!response.ok) {
    const failure = (await response.json().catch(() => null)) as { code?: string } | null;
    throw new ReviewServiceError(response.status, failure?.code ?? null);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function recoverWorkspace() {
  return request<{ organizationId: string; tenantId: string }>("/v1/workspaces/recover", {
    method: "POST",
  });
}

export function listReviewCases(status?: ReviewQueueItem["status"]) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return request<ReviewQueueItem[]>(`/v1/review-cases${query}`);
}

export function createReviewCase(input: {
  automatedSystemVersion: string;
  evidence: Array<{ digest: string; id: string; mediaType: string }>;
  externalReference: string;
  policyVersion: string;
  recommendation: ReviewQueueItem["recommendation"];
  riskLevel: ReviewQueueItem["riskLevel"];
  reviewDueAt: string;
  ruleId: string;
}) {
  return request<{ hollisCaseReference: string; id: string; replayed: boolean }>(
    "/v1/review-cases",
    {
      body: JSON.stringify(input),
      method: "POST",
    },
  );
}

export function listWorkspacePolicies() {
  return request<WorkspacePolicy[]>("/v1/policies");
}

export function createWorkspacePolicy(input: {
  controls: WorkspacePolicy["controls"];
  documentDigest: string;
  policyId: string;
  title: string;
  version: string;
}) {
  return request<WorkspacePolicy>("/v1/policies", {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export function getReviewCase(caseId: string) {
  return request<ReviewCaseDetail>(`/v1/review-cases/${caseId}`);
}

export function getReviewExport(caseId: string) {
  return request<ReviewExport>(`/v1/review-cases/${caseId}/export`);
}

export function claimReviewCase(caseId: string) {
  return request(`/v1/review-cases/${caseId}/claim`, { method: "POST" });
}

export function escalateReviewCase(caseId: string, reason: string) {
  return request(`/v1/review-cases/${caseId}/escalate`, {
    body: JSON.stringify({ reason }),
    method: "POST",
  });
}

export function decideReviewCase(
  caseId: string,
  input: {
    finalRecommendation: ReviewQueueItem["recommendation"];
    outcome: Exclude<ReviewCaseDetail["decisionOutcome"], null>;
    rationale: string;
  },
) {
  return request(`/v1/review-cases/${caseId}/decision`, {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export function createEvidenceUpload(
  caseId: string,
  input: { digest: string; mediaType: string; sizeBytes: number },
) {
  return request<{ evidenceId: string; uploadUrl: string }>(
    `/v1/review-cases/${caseId}/evidence/uploads`,
    {
      body: JSON.stringify(input),
      method: "POST",
    },
  );
}

export function verifyEvidence(caseId: string, evidenceId: string) {
  return request<void>(`/v1/review-cases/${caseId}/evidence/${evidenceId}/verify`, {
    method: "POST",
  });
}

export function listAttestations(caseId: string) {
  return request<AttestationRecord[]>(`/v1/review-cases/${caseId}/attestations`);
}

export function listPublicAttestationCaseFiles(caseId: string) {
  return request<PublicAttestationCaseFile[]>(`/v1/review-cases/${caseId}/attestation-case-files`);
}

export function createPublicAttestationCaseFile(caseId: string, policy: AttestationPolicy) {
  return request<PublicAttestationCaseFile>(`/v1/review-cases/${caseId}/attestation-case-files`, {
    body: JSON.stringify({ policy }),
    method: "POST",
  });
}

export function importFinalizedAttestation(
  caseId: string,
  publicCaseFileId: string,
  transactionHash: string,
) {
  return request<AttestationRecord>(`/v1/review-cases/${caseId}/attestations/import`, {
    body: JSON.stringify({ publicCaseFileId, transactionHash }),
    method: "POST",
  });
}

export function createAttestation(
  caseId: string,
  input: {
    policy: {
      control: {
        attestationCriterion: string;
        controlId: string;
        controlVersion: string;
        evidenceRequirement: "none" | "reference_required" | "verified_reference_required";
        interpretation: "deterministic" | "judgment_required";
        policyDocumentDigest: string;
      };
      policyId: string;
      policyVersion: string;
    };
    publicCaseFileUrl: string;
  },
) {
  return request<AttestationRecord>(`/v1/review-cases/${caseId}/attestations`, {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export function refreshAttestation(caseId: string, attestationId: string) {
  return request<AttestationRecord>(
    `/v1/review-cases/${caseId}/attestations/${attestationId}/refresh`,
    { method: "POST" },
  );
}
