import type {
  CreateReviewCase,
  DecideReviewCase,
  EscalateReviewCase,
  ReviewCaseStatus,
  ReviewExport,
  ReviewOutcome,
} from "@hollis/contracts";

export type ReviewQueueItem = {
  assignedToUserId: string | null;
  createdAt: Date;
  externalReference: string;
  hollisCaseReference: string;
  id: string;
  recommendation: CreateReviewCase["recommendation"];
  reviewDueAt: Date | null;
  riskLevel: CreateReviewCase["riskLevel"];
  status: ReviewCaseStatus;
};

export type ReviewCaseDetail = ReviewQueueItem & {
  assignedAt: Date | null;
  automatedSystemVersion: string;
  decisionOutcome: Exclude<ReviewOutcome, "escalated"> | null;
  decisionRationale: string | null;
  decidedAt: Date | null;
  decidedByUserId: string | null;
  escalationReason: string | null;
  escalatedAt: Date | null;
  escalatedByUserId: string | null;
  evidence: Array<{ digest: string; id: string; mediaType: string }>;
  finalRecommendation: CreateReviewCase["recommendation"] | null;
  knownLimitations?: string | null;
  policyId?: string | null;
  policyVersion: string;
  ruleId: string;
};

export type WorkflowResult = {
  case: ReviewCaseDetail;
  replayed: boolean;
};

export type DecisionPacketAcknowledgement = {
  packetDigest: string;
};

export type ReviewMemberIdentity = {
  avatarUrl: string | null;
  displayName: string | null;
  email: string | null;
  role: string;
  userId: string;
};

export interface ReviewWorkflowStore {
  acknowledgeDecisionPacket?(
    tenantId: string,
    actorId: string,
    caseId: string,
    knownLimitations: string,
  ): Promise<DecisionPacketAcknowledgement>;
  claim(tenantId: string, actorId: string, caseId: string): Promise<WorkflowResult>;
  decide(
    tenantId: string,
    actorId: string,
    caseId: string,
    input: DecideReviewCase,
  ): Promise<WorkflowResult>;
  escalate(
    tenantId: string,
    actorId: string,
    caseId: string,
    input: EscalateReviewCase,
  ): Promise<WorkflowResult>;
  get(tenantId: string, caseId: string): Promise<ReviewCaseDetail | null>;
  exportCase(tenantId: string, caseId: string): Promise<ReviewExport | null>;
  list(tenantId: string, status?: ReviewCaseStatus): Promise<ReviewQueueItem[]>;
}

export class ReviewCaseNotFoundError extends Error {
  constructor() {
    super("The review case was not found.");
    this.name = "ReviewCaseNotFoundError";
  }
}

export class ReviewCaseTransitionError extends Error {
  constructor() {
    super("The review case cannot make that transition.");
    this.name = "ReviewCaseTransitionError";
  }
}

export function toWorkflowResponse(result: WorkflowResult) {
  return {
    assignedAt: result.case.assignedAt?.toISOString() ?? null,
    assignedToUserId: result.case.assignedToUserId,
    createdAt: result.case.createdAt.toISOString(),
    decisionOutcome: result.case.decisionOutcome,
    decidedAt: result.case.decidedAt?.toISOString() ?? null,
    externalReference: result.case.externalReference,
    hollisCaseReference: result.case.hollisCaseReference,
    id: result.case.id,
    replayed: result.replayed,
    reviewDueAt: result.case.reviewDueAt?.toISOString() ?? null,
    status: result.case.status,
  };
}

export function toQueueResponse(item: ReviewQueueItem) {
  return {
    assignedToUserId: item.assignedToUserId,
    createdAt: item.createdAt.toISOString(),
    externalReference: item.externalReference,
    hollisCaseReference: item.hollisCaseReference,
    id: item.id,
    recommendation: item.recommendation,
    reviewDueAt: item.reviewDueAt?.toISOString() ?? null,
    riskLevel: item.riskLevel,
    status: item.status,
  };
}

export function toDetailResponse(
  item: ReviewCaseDetail,
  assignedReviewer: ReviewMemberIdentity | null = null,
) {
  return {
    assignedAt: item.assignedAt?.toISOString() ?? null,
    assignedReviewer,
    assignedToUserId: item.assignedToUserId,
    automatedSystemVersion: item.automatedSystemVersion,
    createdAt: item.createdAt.toISOString(),
    decisionOutcome: item.decisionOutcome,
    decisionRationale: item.decisionRationale,
    decidedAt: item.decidedAt?.toISOString() ?? null,
    decidedByUserId: item.decidedByUserId,
    escalationReason: item.escalationReason,
    escalatedAt: item.escalatedAt?.toISOString() ?? null,
    escalatedByUserId: item.escalatedByUserId,
    evidence: item.evidence,
    externalReference: item.externalReference,
    hollisCaseReference: item.hollisCaseReference,
    finalRecommendation: item.finalRecommendation,
    knownLimitations: item.knownLimitations,
    id: item.id,
    policyId: item.policyId,
    policyVersion: item.policyVersion,
    recommendation: item.recommendation,
    reviewDueAt: item.reviewDueAt?.toISOString() ?? null,
    riskLevel: item.riskLevel,
    ruleId: item.ruleId,
    status: item.status,
  };
}

export function toExportResponse(value: ReviewExport) {
  return value;
}
