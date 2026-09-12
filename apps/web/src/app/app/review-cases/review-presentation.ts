import type { ReviewQueueItem } from "./data";

export type HorizonBucket = "overdue" | "today" | "soon" | "later";
export type HorizonRow = "critical" | "high" | "standard";

type AssignedReviewer = {
  displayName: string | null;
  email: string | null;
  role: string;
};

export function presentAssignee(
  assignedToUserId: string | null,
  assignedReviewer: AssignedReviewer | null,
) {
  if (!assignedToUserId) return { meta: null, name: "Unassigned" };
  if (!assignedReviewer) return { meta: null, name: "Unknown former member" };

  const role = assignedReviewer.role.replaceAll("_", " ");
  return {
    meta: [role, assignedReviewer.email].filter(Boolean).join(" · "),
    name: assignedReviewer.displayName || assignedReviewer.email || "Workspace member",
  };
}

export function keyEvidenceRecords<T extends { digest: string; id: string }>(records: T[]) {
  const occurrences = new Map<string, number>();
  return records.map((record) => {
    const baseKey = `${record.id}:${record.digest}`;
    const occurrence = occurrences.get(baseKey) ?? 0;
    occurrences.set(baseKey, occurrence + 1);
    return { key: `${baseKey}:${occurrence}`, record };
  });
}

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
