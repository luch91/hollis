"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  claimReviewCase,
  createEvidenceUpload,
  removeEvidence,
  createPublicAttestationCaseFile,
  createReviewCase,
  createWorkspacePolicy,
  decideReviewCase,
  deployPolicyContract,
  escalateReviewCase,
  importFinalizedAttestation,
  ReviewServiceError,
  recoverWorkspace,
  refreshAttestation,
  uploadWorkspacePolicySource,
  verifyEvidence,
} from "./data";

function requiredValue(formData: FormData, name: string): string {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function revalidateWorkspace(caseId: string) {
  revalidatePath("/app");
  revalidatePath("/app/review-cases");
  revalidatePath("/app/audit");
  revalidatePath("/app/cases");
  revalidatePath("/app/evidence");
  revalidatePath("/app/exports");
  revalidatePath("/app/policy");
  revalidatePath("/app/receipts");
  revalidatePath(`/app/review-cases/${caseId}`);
}

function dueAtUtc(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error("A due date and time in UTC is required.");
  }
  const dueAt = new Date(`${value}:00.000Z`);
  if (Number.isNaN(dueAt.getTime())) throw new Error("The due date is invalid.");
  return dueAt.toISOString();
}

function selectedPolicyBinding(value: string) {
  const [policyId, policyVersion, ruleId, ...unexpected] = value.split("::");
  if (!policyId || !policyVersion || !ruleId || unexpected.length > 0) {
    throw new Error("Select a published policy control.");
  }
  return { policyId, policyVersion, ruleId };
}

function policySourceMediaType(file: File): string | null {
  const supported = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/markdown",
    "text/plain",
  ]);
  if (supported.has(file.type)) return file.type;

  const extension = file.name.trim().toLowerCase().split(".").at(-1);
  if (extension === "pdf") return "application/pdf";
  if (extension === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (extension === "md") return "text/markdown";
  if (extension === "txt") return "text/plain";
  return null;
}

export type PolicyPublicationState =
  | { status: "idle" }
  | {
      policyId: string;
      policyVersionId: string;
      status: "published";
      title: string;
      version: string;
    }
  | { code: string | null; status: "conflict" | "error" | "permission" | "source" | "unavailable" };

export async function createWorkspacePolicyAction(
  _previousState: PolicyPublicationState,
  formData: FormData,
): Promise<PolicyPublicationState> {
  const policyId = requiredValue(formData, "policyId");
  const version = requiredValue(formData, "version");
  const controlId = requiredValue(formData, "controlId");
  const sourceFile = formData.get("policySourceFile");
  if (!(sourceFile instanceof File) || sourceFile.size === 0 || sourceFile.size > 5_242_880) {
    return { code: "source-file-invalid", status: "source" };
  }
  const mediaType = policySourceMediaType(sourceFile);
  if (!mediaType) return { code: "source-file-type-required", status: "source" };
  let source: Awaited<ReturnType<typeof uploadWorkspacePolicySource>>;
  try {
    source = await uploadWorkspacePolicySource({
      content: new Uint8Array(await sourceFile.arrayBuffer()),
      fileName: sourceFile.name,
      mediaType,
    });
    const policy = await createWorkspacePolicy({
      controls: [
        {
          attestationCriterion: requiredValue(formData, "attestationCriterion"),
          controlId,
          controlVersion: requiredValue(formData, "controlVersion"),
          evidenceRequirement: requiredValue(formData, "evidenceRequirement") as
            | "none"
            | "reference_required"
            | "verified_reference_required",
          interpretation: requiredValue(formData, "interpretation") as
            | "deterministic"
            | "judgment_required",
          title: requiredValue(formData, "controlTitle"),
        },
      ],
      documentDigest: source.digest,
      policyId,
      source: {
        fileName: source.fileName,
        mediaType: source.mediaType,
        sizeBytes: source.sizeBytes,
      },
      title: requiredValue(formData, "title"),
      version,
    });
    revalidatePath("/app/policy");
    revalidatePath("/app/review-cases/new");
    return {
      policyId: policy.policyId,
      policyVersionId: policy.id,
      status: "published",
      title: policy.title,
      version: policy.version,
    };
  } catch (error) {
    if (error instanceof ReviewServiceError && error.code === "policy_version_conflict") {
      return { code: error.code, status: "conflict" };
    }
    if (error instanceof ReviewServiceError) {
      if (error.status === 401) return { code: error.code, status: "permission" };
      if (error.status === 403) return { code: error.code, status: "permission" };
      if (error.status === 503 || error.code === "policy_source_storage_unconfigured") {
        return { code: error.code, status: "unavailable" };
      }
      if (error.code?.startsWith("policy_source_")) {
        return { code: error.code, status: "source" };
      }
      return { code: error.code, status: "error" };
    }
    return { code: null, status: "error" };
  }
}

export async function deployPolicyContractAction(formData: FormData) {
  const policyVersionId = requiredValue(formData, "policyVersionId");
  const controlId = requiredValue(formData, "controlId");
  await deployPolicyContract(policyVersionId, controlId);
  revalidatePath(`/app/policy/${policyVersionId}`);
  redirect(`/app/policy/${policyVersionId}?deployment=${encodeURIComponent(controlId)}`);
}

export async function createReviewCaseAction(formData: FormData) {
  "use server";

  const file = formData.get("evidenceFile");
  if (!(file instanceof File) || file.size === 0 || file.size > 5_242_880) {
    throw new Error("Evidence must be a non-empty file no larger than 5 MB.");
  }
  const evidenceId = file.name.trim();
  if (!evidenceId || evidenceId.length > 128) {
    throw new Error("The evidence file name must be between 1 and 128 characters.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const digestBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const digest = `sha256:${Array.from(new Uint8Array(digestBuffer), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  const policyBinding = selectedPolicyBinding(requiredValue(formData, "policyBinding"));
  const reviewCase = await createReviewCase({
    automatedSystemVersion: requiredValue(formData, "automatedSystemVersion"),
    evidence: [{ digest, id: evidenceId, mediaType: file.type || "application/octet-stream" }],
    externalReference: requiredValue(formData, "externalReference"),
    policyId: policyBinding.policyId,
    policyVersion: policyBinding.policyVersion,
    recommendation: requiredValue(formData, "recommendation") as Parameters<
      typeof createReviewCase
    >[0]["recommendation"],
    riskLevel: requiredValue(formData, "riskLevel") as Parameters<
      typeof createReviewCase
    >[0]["riskLevel"],
    reviewDueAt: dueAtUtc(requiredValue(formData, "reviewDueAt")),
    ruleId: policyBinding.ruleId,
  });

  const upload = await createEvidenceUpload(reviewCase.id, {
    digest,
    mediaType: file.type || "application/octet-stream",
    sizeBytes: file.size,
  });
  if (upload.uploadUrl) {
    const stored = await fetch(upload.uploadUrl, {
      body: bytes,
      headers: { "content-type": file.type || "application/octet-stream" },
      method: "PUT",
    });
    if (!stored.ok) throw new Error("Evidence storage upload failed.");
  }
  await verifyEvidence(reviewCase.id, upload.evidenceId);
  revalidateWorkspace(reviewCase.id);
  redirect(`/app/review-cases?caseId=${encodeURIComponent(reviewCase.id)}`);
}

export async function uploadEvidenceAction(formData: FormData) {
  const caseId = String(formData.get("caseId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 5_242_880) {
    throw new Error("Evidence must be a non-empty file no larger than 5 MB.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digestBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const digest = `sha256:${Array.from(new Uint8Array(digestBuffer), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  const upload = await createEvidenceUpload(caseId, {
    digest,
    mediaType: file.type || "application/octet-stream",
    sizeBytes: file.size,
  });
  if (upload.uploadUrl) {
    const stored = await fetch(upload.uploadUrl, {
      body: bytes,
      headers: { "content-type": file.type || "application/octet-stream" },
      method: "PUT",
    });
    if (!stored.ok) {
      throw new Error("Evidence storage upload failed.");
    }
  }
  await verifyEvidence(caseId, upload.evidenceId);
  revalidateWorkspace(caseId);
}

export async function removeEvidenceAction(formData: FormData) {
  const caseId = String(formData.get("caseId") ?? "");
  const evidenceId = String(formData.get("evidenceId") ?? "");
  if (!caseId || !evidenceId)
    throw new Error("Evidence removal requires a case and evidence reference.");
  await removeEvidence(caseId, evidenceId);
  revalidateWorkspace(caseId);
  redirect(`/app/review-cases/${caseId}`);
}

export async function claimAction(formData: FormData) {
  const caseId = String(formData.get("caseId") ?? "");
  await claimReviewCase(caseId);
  revalidateWorkspace(caseId);
  redirect(`/app/review-cases/${caseId}`);
}

export async function recoverWorkspaceAction() {
  await recoverWorkspace();
  revalidatePath("/app");
}

export async function escalateAction(formData: FormData) {
  const caseId = String(formData.get("caseId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  await escalateReviewCase(caseId, reason);
  revalidateWorkspace(caseId);
  redirect(`/app/review-cases/${caseId}`);
}

export async function decideAction(formData: FormData) {
  const caseId = String(formData.get("caseId") ?? "");
  const finalRecommendation = String(formData.get("finalRecommendation") ?? "") as Parameters<
    typeof decideReviewCase
  >[1]["finalRecommendation"];
  const outcome = String(formData.get("outcome") ?? "") as Parameters<
    typeof decideReviewCase
  >[1]["outcome"];
  const rationale = String(formData.get("rationale") ?? "");
  await decideReviewCase(caseId, { finalRecommendation, outcome, rationale });
  revalidateWorkspace(caseId);
  redirect(`/app/review-cases/${caseId}`);
}

function policyFromForm(formData: FormData) {
  return {
    control: {
      attestationCriterion: requiredValue(formData, "attestationCriterion"),
      controlId: requiredValue(formData, "controlId"),
      controlVersion: requiredValue(formData, "controlVersion"),
      evidenceRequirement: requiredValue(formData, "evidenceRequirement") as
        | "none"
        | "reference_required"
        | "verified_reference_required",
      interpretation: requiredValue(formData, "interpretation") as
        | "deterministic"
        | "judgment_required",
      policyDocumentDigest: requiredValue(formData, "policyDocumentDigest"),
    },
    policyId: requiredValue(formData, "policyId"),
    policyVersion: requiredValue(formData, "policyVersion"),
  };
}

export async function createPublicAttestationCaseFileAction(formData: FormData) {
  const caseId = requiredValue(formData, "caseId");
  const caseFile = await createPublicAttestationCaseFile(caseId, policyFromForm(formData));
  revalidateWorkspace(caseId);
  redirect(`/app/review-cases/${caseId}?caseFile=${caseFile.publicId}#attestation`);
}

export async function importFinalizedAttestationAction(formData: FormData) {
  const caseId = requiredValue(formData, "caseId");
  await importFinalizedAttestation(
    caseId,
    requiredValue(formData, "publicCaseFileId"),
    requiredValue(formData, "transactionHash"),
  );
  revalidateWorkspace(caseId);
}

export async function refreshAttestationAction(formData: FormData) {
  const caseId = requiredValue(formData, "caseId");
  const attestationId = requiredValue(formData, "attestationId");
  await refreshAttestation(caseId, attestationId);
  revalidateWorkspace(caseId);
}
