import type { ReviewQueueItem } from "./data";

export type HorizonBucket = "overdue" | "today" | "soon" | "later";
export type HorizonRow = "critical" | "high" | "standard";

export function dueBucket(value: string | null, now: Date): HorizonBucket {
  if (!value) return "later";
  const due = new Date(value);
  const hours = (due.getTime() - now.getTime()) / 3_600_000;
  if (hours < 0) return "overdue";
  if (hours <= 24) return "today";
  if (hours <= 168) return "soon";
  return "later";
}

export function riskRow(risk: ReviewQueueItem["riskLevel"]): HorizonRow {
  if (risk === "critical" || risk === "high") return risk;
  return "standard";
}

export function caseUrgency(
  reviewCase: Pick<ReviewQueueItem, "reviewDueAt" | "riskLevel">,
  now: Date,
) {
  const bucketRank: Record<HorizonBucket, number> = {
    overdue: 0,
    today: 1,
    soon: 2,
    later: 3,
  };
  const riskRank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  return bucketRank[dueBucket(reviewCase.reviewDueAt, now)] * 10 + riskRank[reviewCase.riskLevel];
}

export function matchesReviewSearch(
  reviewCase: Pick<ReviewQueueItem, "externalReference" | "hollisCaseReference" | "recommendation">,
  searchTerm: string,
) {
  const normalized = searchTerm.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return [
    reviewCase.hollisCaseReference,
    reviewCase.externalReference,
    reviewCase.recommendation,
  ].some((value) => value.toLocaleLowerCase().includes(normalized));
}
