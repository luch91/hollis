import type { CreateReviewCase, ReviewCase } from "@hollis/contracts";
import { createHash, randomUUID } from "node:crypto";

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

export async function createReviewIntake(
  input: CreateReviewCase,
  context: { actorId: string; tenantId: string },
  store: ReviewIntakeStore,
  options: { caseId?: string; occurredAt?: Date } = {},
): Promise<ReviewCase> {
  const caseId = options.caseId ?? randomUUID();
  const occurredAt = options.occurredAt ?? new Date();
  const fingerprint = digest(input);
  const eventHash = digest({
    actorId: context.actorId,
    caseId,
    eventType: "case_created",
    occurredAt: occurredAt.toISOString(),
    payload: input,
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
