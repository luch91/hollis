export const legalHoldState = {
  active: "active",
  none: "none",
} as const;

export type LegalHoldState = (typeof legalHoldState)[keyof typeof legalHoldState];

export type RetentionCandidate = {
  caseStatus: "pending" | "in_review" | "completed" | "escalated";
  legalHold: LegalHoldState;
  retentionUntil: Date | null;
  verified: boolean;
};

export function isRetentionEligible(candidate: RetentionCandidate, now: Date): boolean {
  if (candidate.caseStatus !== "completed") return false;
  if (candidate.legalHold !== legalHoldState.none) return false;
  if (!candidate.verified || !candidate.retentionUntil) return false;
  return candidate.retentionUntil.getTime() <= now.getTime();
}

export function assertLegalHoldState(value: string): LegalHoldState {
  if (value === legalHoldState.none || value === legalHoldState.active) return value;
  throw new Error("Invalid legal hold state.");
}
