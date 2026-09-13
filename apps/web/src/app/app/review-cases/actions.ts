"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createReviewCase,
  createWorkspacePolicy,
  deployPolicyContract,
  createPublicAttestationCaseFile,
  createEvidenceUpload,
  claimReviewCase,
  decideReviewCase,
  escalateReviewCase,
  refreshAttestation,
  importFinalizedAttestation,
  recoverWorkspace,
  ReviewServiceError,
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

export async function createWorkspacePolicyAction(formData: FormData) {
  const policyId = requiredValue(formData, "policyId");
  const version = requiredValue(formData, "version");
  const controlId = requiredValue(formData, "controlId");
  try {
    await createWorkspacePolicy({
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
      documentDigest: requiredValue(formData, "documentDigest"),
      policyId,
      title: requiredValue(formData, "title"),
      version,
    });
  } catch (error) {
    if (error instanceof ReviewServiceError && error.code === "policy_version_conflict") {
      revalidatePath("/app/policy");
      redirect("/app/policy?publish=conflict");
    }
    throw error;
  }
  revalidatePath("/app/policy");
  revalidatePath("/app/review-cases/new");
  redirect("/app/policy");
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

export async function claimAction(formData: FormData) {
  const caseId = String(formData.get("caseId") ?? "");
  await claimReviewCase(caseId);
  revalidateWorkspace(caseId);
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
