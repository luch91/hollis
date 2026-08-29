"use server";

import { revalidatePath } from "next/cache";
import { claimReviewCase, decideReviewCase, escalateReviewCase } from "./data";

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
