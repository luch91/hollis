import { withAuth } from "@workos-inc/authkit-nextjs";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type ReviewQueueItem = {
  assignedToUserId: string | null;
  createdAt: string;
  externalReference: string;
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await withAuth({ ensureSignedIn: true });
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${session.accessToken}`);
  if (init?.body) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers,
  });

  if (!response.ok) {
    throw new Error("The review service could not complete the request.");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function listReviewCases() {
  return request<ReviewQueueItem[]>("/v1/review-cases");
}

export function getReviewCase(caseId: string) {
  return request<ReviewCaseDetail>(`/v1/review-cases/${caseId}`);
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
