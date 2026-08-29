"use server";

import { revalidatePath } from "next/cache";
import {
  createEvidenceUpload,
  claimReviewCase,
  decideReviewCase,
  escalateReviewCase,
  verifyEvidence,
} from "./data";

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
  const stored = await fetch(upload.uploadUrl, {
    body: bytes,
    headers: { "content-type": file.type || "application/octet-stream" },
    method: "PUT",
  });
  if (!stored.ok) throw new Error("Evidence storage upload failed.");
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
