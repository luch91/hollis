import type { CreateReviewCase, ReviewCase } from "@hollis/contracts";
import { createHash, randomUUID } from "node:crypto";
import { hashAuditEvent } from "./audit-integrity.js";

export type TenantContext = {
  id: string;
};

export interface TenantResolver {
  findByTenantId(tenantId: string): Promise<TenantContext | null>;
}

export type ReviewIntakeRecord = CreateReviewCase & {
  actorId: string;
  caseId: string;
  eventHash: string;
  fingerprint: string;
  occurredAt: Date;
  tenantId: string;
};

export type StoredReviewCase = {
  createdAt: Date;
  externalReference: string;
  fingerprint: string;
  hollisCaseReference: string;
  id: string;
  reviewDueAt: Date | null;
  status: "draft" | "pending" | "in_review" | "completed" | "escalated";
};

export interface ReviewIntakeStore {
  create(record: ReviewIntakeRecord): Promise<{ created: boolean; reviewCase: StoredReviewCase }>;
}

export class ReviewIntakeConflictError extends Error {
  constructor() {
    super("The external reference is already associated with different intake content.");
    this.name = "ReviewIntakeConflictError";
  }
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

/**
 * This is the exact event body that is both signed and persisted for a new
 * case. Keeping it in one place prevents the stored genesis event from ever
 * differing from the event that its hash commits to.
 */
export function caseCreatedAuditPayload(input: CreateReviewCase) {
  return {
    automatedSystemVersion: input.automatedSystemVersion,
    evidence: input.evidence,
    externalReference: input.externalReference,
    ...(input.policyId ? { policyId: input.policyId } : {}),
    policyVersion: input.policyVersion,
    recommendation: input.recommendation,
    riskLevel: input.riskLevel,
    reviewDueAt: input.reviewDueAt,
    ruleId: input.ruleId,
  };
}

export async function createReviewIntake(
  input: CreateReviewCase,
  context: { actorId: string; tenantId: string },
  store: ReviewIntakeStore,
  options: { caseId?: string; occurredAt?: Date } = {},
): Promise<ReviewCase> {
  const caseId = options.caseId ?? randomUUID();
  const occurredAt = options.occurredAt ?? new Date();
  const fingerprint = digest(input);
  const eventHash = hashAuditEvent({
    actorId: context.actorId,
    caseId,
    eventType: "case_created",
    occurredAt: occurredAt.toISOString(),
    payload: caseCreatedAuditPayload(input),
    previousHash: null,
    tenantId: context.tenantId,
  });
  const result = await store.create({
    ...input,
    actorId: context.actorId,
    caseId,
    eventHash,
    fingerprint,
    occurredAt,
    tenantId: context.tenantId,
  });

  if (!result.created && result.reviewCase.fingerprint !== fingerprint) {
    throw new ReviewIntakeConflictError();
  }

  return {
    createdAt: result.reviewCase.createdAt.toISOString(),
    externalReference: result.reviewCase.externalReference,
    hollisCaseReference: result.reviewCase.hollisCaseReference,
    id: result.reviewCase.id,
    replayed: !result.created,
    reviewDueAt: result.reviewCase.reviewDueAt?.toISOString() ?? null,
    status: result.reviewCase.status,
  };
}
