import { Buffer } from "node:buffer";
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
  status: "draft" | "pending" | "in_review" | "escalated" | "completed";
};

export type ReviewCaseDetail = ReviewQueueItem & {
  assignedAt: string | null;
  assignedReviewer: {
    avatarUrl: string | null;
    displayName: string | null;
    email: string | null;
    role: string;
    userId: string;
  } | null;
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
  knownLimitations: string | null;
  policyId?: string | null;
  policyVersion: string;
  recommendation: ReviewQueueItem["recommendation"];
  riskLevel: ReviewQueueItem["riskLevel"];
  ruleId: string;
};

export type EvidenceLifecycleRecord = {
  attempts: number;
  deletedAt: string | null;
  deletionProviderResult: string | null;
  digest: string;
  id: string;
  lastFailure: string | null;
  legalHold: "active" | "none";
  mediaType: string;
  retentionStatus: "available" | "scheduled" | "processing" | "failed" | "dead_letter" | "deleted";
  retentionUntil: string | null;
  verified: boolean;
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
    auditManifestHash: string;
    canonicalRecord?: {
      schemaVersion: "hollis.canonical-case.v1";
    };
    caseCommitment: string;
    commitmentVersion?: "hollis.case-commitment.v1";
    evidence: Array<{
      digest: string;
      mediaType: string;
      verified: boolean;
    }>;
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
    review: {
      decisionRecorded: boolean;
      escalationRecorded: boolean;
      humanDecisionOutcome: "approved" | "modified" | "rejected" | null;
      reviewerActionCommitment: string | null;
    };
    schemaVersion: string;
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
  source: {
    fileName: string;
    mediaType:
      | "application/pdf"
      | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      | "text/markdown"
      | "text/plain";
    sizeBytes: number;
  } | null;
  title: string;
  version: string;
};

export type PolicyContractDeployment = {
  bindingDigest?: string;
  contractAddress: string | null;
  deploymentTransactionHash: string | null;
  failureCode: string | null;
  network?: "studio-dev" | "studio-next";
  networkChainId?: number;
  runtimeAddress?: string;
  sourceDigest?: string;
  sourceVersion?: string;
  status: string;
};

export type ManagedAttestationStatus = {
  configured: boolean;
  deployment: PolicyContractDeployment | null;
  submission: {
    caseCommitment: string;
    contractAddress: string;
    evaluationReason: string | null;
    failureCode: string | null;
    finalizedAt: string | null;
    publicCaseFileUrl: string;
    status:
      | "pending"
      | "submitting"
      | "submitted"
      | "finalized"
      | "failed"
      | "reconciliation_required";
    transactionHash: string | null;
    verdict: "pass" | "fail" | "needs_review" | "undetermined" | null;
  } | null;
};

export type WorkspaceReviewerSearchResult = {
  displayName: string | null;
  email: string | null;
  role: string;
  userId: string;
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
  policyId: string;
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

export function getPolicyContractDeployment(policyVersionId: string, controlId: string) {
  return request<PolicyContractDeployment | null>(
    `/v1/policies/${policyVersionId}/controls/${encodeURIComponent(controlId)}/genlayer-deployment`,
  );
}

export function deployPolicyContract(policyVersionId: string, controlId: string) {
  return request<PolicyContractDeployment>(
    `/v1/policies/${policyVersionId}/controls/${encodeURIComponent(controlId)}/genlayer-deployment`,
    { method: "POST" },
  );
}

export function searchWorkspaceReviewers(query: string) {
  return request<WorkspaceReviewerSearchResult[]>(
    `/v1/workspace/search/reviewers?q=${encodeURIComponent(query)}`,
  );
}

export function createWorkspacePolicy(input: {
  controls: WorkspacePolicy["controls"];
  documentDigest: string;
  policyId: string;
  source: NonNullable<WorkspacePolicy["source"]>;
  title: string;
  version: string;
}) {
  return request<WorkspacePolicy>("/v1/policies", {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export async function uploadWorkspacePolicySource(input: {
  content: Uint8Array;
  fileName: string;
  mediaType: string;
}) {
  const sessionToken = await readHollisSessionToken();
  if (!sessionToken) redirect("/sign-in");
  const response = await fetch(`${apiUrl}/v1/policy-source`, {
    body: Buffer.from(input.content),
    cache: "no-store",
    headers: {
      authorization: `Bearer ${sessionToken}`,
      "content-type": input.mediaType,
      "x-hollis-policy-source-name": input.fileName,
    },
    method: "PUT",
  });
  if (!response.ok) {
    const failure = (await response.json().catch(() => null)) as { code?: string } | null;
    throw new ReviewServiceError(response.status, failure?.code ?? null);
  }
  return response.json() as Promise<{
    digest: string;
    fileName: string;
    mediaType: NonNullable<WorkspacePolicy["source"]>["mediaType"];
    sizeBytes: number;
  }>;
}

export function getReviewCase(caseId: string) {
  return request<ReviewCaseDetail>(`/v1/review-cases/${caseId}`);
}

export function getManagedAttestationStatus(caseId: string) {
  return request<ManagedAttestationStatus>(`/v1/review-cases/${caseId}/managed-attestation`);
}

export function getReviewExport(caseId: string) {
  return request<ReviewExport>(`/v1/review-cases/${caseId}/export`);
}

export function listEvidenceLifecycle(caseId: string) {
  return request<EvidenceLifecycleRecord[]>(`/v1/review-cases/${caseId}/evidence`);
}

export function setEvidenceLegalHold(caseId: string, evidenceId: string, active: boolean) {
  return request<void>(`/v1/review-cases/${caseId}/evidence/${evidenceId}/legal-hold`, {
    body: JSON.stringify({ active }),
    method: "POST",
  });
}

export function getEvidenceDownload(caseId: string, evidenceId: string) {
  return request<{ downloadUrl: string }>(
    `/v1/review-cases/${caseId}/evidence/${evidenceId}/download`,
  );
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
    knownLimitations: string;
    outcome: Exclude<ReviewCaseDetail["decisionOutcome"], null>;
    rationale: string;
  },
) {
  return request(`/v1/review-cases/${caseId}/decision`, {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export function acknowledgeDecisionPacket(caseId: string, knownLimitations: string) {
  return request<{ packetDigest: string }>(
    `/v1/review-cases/${caseId}/decision-packet/acknowledgements`,
    {
      body: JSON.stringify({ knownLimitations }),
      method: "POST",
    },
  );
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

export function removeEvidence(caseId: string, evidenceId: string) {
  return request<void>(`/v1/review-cases/${caseId}/evidence/${evidenceId}`, {
    method: "DELETE",
  });
}

export function listAttestations(caseId: string) {
  return request<AttestationRecord[]>(`/v1/review-cases/${caseId}/attestations`);
}

export function listPublicAttestationCaseFiles(caseId: string) {
  return request<PublicAttestationCaseFile[]>(`/v1/review-cases/${caseId}/attestation-case-files`);
}

export function createPublicAttestationCaseFile(caseId: string) {
  return request<PublicAttestationCaseFile>(`/v1/review-cases/${caseId}/attestation-case-files`, {
    body: JSON.stringify({}),
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
