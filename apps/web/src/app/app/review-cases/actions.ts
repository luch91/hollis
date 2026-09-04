"use server";

import { revalidatePath } from "next/cache";
import {
  createPublicAttestationCaseFile,
  createEvidenceUpload,
  claimReviewCase,
  decideReviewCase,
  escalateReviewCase,
  refreshAttestation,
  importFinalizedAttestation,
  verifyEvidence,
} from "./data";

function requiredValue(formData: FormData, name: string): string {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
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
  revalidatePath(`/app/review-cases/${caseId}`);
}

export async function claimAction(formData: FormData) {
  const caseId = String(formData.get("caseId") ?? "");
  await claimReviewCase(caseId);
  revalidatePath("/app");
  revalidatePath(`/app/review-cases/${caseId}`);
}

export async function escalateAction(formData: FormData) {
  const caseId = String(formData.get("caseId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  await escalateReviewCase(caseId, reason);
  revalidatePath("/app");
  revalidatePath(`/app/review-cases/${caseId}`);
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
  revalidatePath("/app");
  revalidatePath(`/app/review-cases/${caseId}`);
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
  await createPublicAttestationCaseFile(caseId, policyFromForm(formData));
  revalidatePath(`/app/review-cases/${caseId}`);
}

export async function importFinalizedAttestationAction(formData: FormData) {
  const caseId = requiredValue(formData, "caseId");
  await importFinalizedAttestation(
    caseId,
    requiredValue(formData, "publicCaseFileId"),
    requiredValue(formData, "transactionHash"),
  );
  revalidatePath(`/app/review-cases/${caseId}`);
}

export async function refreshAttestationAction(formData: FormData) {
  const caseId = requiredValue(formData, "caseId");
  const attestationId = requiredValue(formData, "attestationId");
  await refreshAttestation(caseId, attestationId);
  revalidatePath(`/app/review-cases/${caseId}`);
}
