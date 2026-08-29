import {
  evidenceReferenceSchema,
  recommendationSchema,
  type ReviewExport,
  riskLevelSchema,
  reviewCaseStatusSchema,
  reviewOutcomeSchema,
} from "@hollis/contracts";
import { evidenceObjects, reviewCases, reviewEvents, tenants } from "@hollis/database";
import { and, asc, desc, eq, inArray, not, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { createDatabase } from "@hollis/database";
import type { ReviewIntakeRecord, ReviewIntakeStore, TenantResolver } from "./review-intake.js";
import type { EvidenceMetadataStore, EvidenceUpload } from "./evidence.js";
import {
  type ReviewCaseDetail,
  type ReviewWorkflowStore,
  ReviewCaseNotFoundError,
  ReviewCaseTransitionError,
} from "./workflow.js";

type Database = ReturnType<typeof createDatabase>["database"];
type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const caseColumns = {
  assignedAt: reviewCases.assignedAt,
  assignedToUserId: reviewCases.assignedToUserId,
  automatedSystemVersion: reviewCases.automatedSystemVersion,
  createdAt: reviewCases.createdAt,
  decisionOutcome: reviewCases.decisionOutcome,
  decisionRationale: reviewCases.decisionRationale,
  decidedAt: reviewCases.decidedAt,
  decidedByUserId: reviewCases.decidedByUserId,
  evidence: reviewCases.evidence,
  escalatedAt: reviewCases.escalatedAt,
  escalatedByUserId: reviewCases.escalatedByUserId,
  escalationReason: reviewCases.escalationReason,
  externalReference: reviewCases.externalReference,
  finalRecommendation: reviewCases.finalRecommendation,
  id: reviewCases.id,
  policyVersion: reviewCases.policyVersion,
  recommendation: reviewCases.recommendation,
  reviewDueAt: reviewCases.reviewDueAt,
  riskLevel: reviewCases.riskLevel,
  ruleId: reviewCases.ruleId,
  status: reviewCases.status,
  tenantId: reviewCases.tenantId,
  updatedAt: reviewCases.updatedAt,
};

function hashEvent(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function parseEvidence(value: unknown) {
  const result = evidenceReferenceSchema.array().safeParse(value);
  if (!result.success) {
    throw new Error("Review case evidence failed validation.");
  }

  return result.data;
}

function mapDetail(row: Record<string, unknown>): ReviewCaseDetail {
  const decisionOutcome = row.decisionOutcome
    ? reviewOutcomeSchema.exclude(["escalated"]).parse(row.decisionOutcome)
    : null;
  const finalRecommendation = row.finalRecommendation
    ? recommendationSchema.parse(row.finalRecommendation)
    : null;

  return {
    ...(row as unknown as Omit<ReviewCaseDetail, "evidence" | "recommendation" | "riskLevel">),
    decisionOutcome,
    finalRecommendation,
    evidence: parseEvidence(row.evidence),
    recommendation: recommendationSchema.parse(row.recommendation),
    riskLevel: riskLevelSchema.parse(row.riskLevel),
    status: reviewCaseStatusSchema.parse(row.status),
  };
}

async function selectCase(transaction: DatabaseTransaction, tenantId: string, caseId: string) {
  const [row] = await transaction
    .select(caseColumns)
    .from(reviewCases)
    .where(and(eq(reviewCases.tenantId, tenantId), eq(reviewCases.id, caseId)))
    .limit(1);

  return row;
}

async function appendEvent(
  transaction: DatabaseTransaction,
  record: {
    actorId: string;
    caseId: string;
    eventType: "review_started" | "case_escalated" | "decision_recorded";
    occurredAt: Date;
    payload: Record<string, unknown>;
    tenantId: string;
  },
) {
  const [previous] = await transaction
    .select({ eventHash: reviewEvents.eventHash })
    .from(reviewEvents)
    .where(and(eq(reviewEvents.tenantId, record.tenantId), eq(reviewEvents.caseId, record.caseId)))
    .orderBy(desc(reviewEvents.eventSequence))
    .limit(1);
  const previousHash = previous?.eventHash ?? null;
  const eventHash = hashEvent({ ...record, previousHash });

  await transaction.insert(reviewEvents).values({
    actorId: record.actorId,
    caseId: record.caseId,
    createdAt: record.occurredAt,
    eventHash,
    eventType: record.eventType,
    payload: record.payload,
    previousHash,
    tenantId: record.tenantId,
  });
}

export function createPostgresTenantResolver(database: Database): TenantResolver {
  return {
    async findByOrganizationId(organizationId) {
      const tenant = await database.transaction(async (transaction) => {
        await transaction.execute(
          sql`select set_config('app.workos_organization_id', ${organizationId}, true)`,
        );
        const [resolved] = await transaction
          .select({ id: tenants.id, organizationId: tenants.workosOrganizationId })
          .from(tenants)
          .where(eq(tenants.workosOrganizationId, organizationId))
          .limit(1);

        return resolved;
      });

      return tenant ?? null;
    },
  };
}

export function createPostgresReviewIntakeStore(database: Database): ReviewIntakeStore {
  return {
    async create(record: ReviewIntakeRecord) {
      return database.transaction(async (transaction) => {
        await transaction.execute(
          sql`select set_config('app.tenant_id', ${record.tenantId}, true)`,
        );

        const [created] = await transaction
          .insert(reviewCases)
          .values({
            automatedSystemVersion: record.automatedSystemVersion,
            createdAt: record.occurredAt,
            externalReference: record.externalReference,
            evidence: record.evidence,
            id: record.caseId,
            intakeFingerprint: record.fingerprint,
            policyVersion: record.policyVersion,
            recommendation: record.recommendation,
            riskLevel: record.riskLevel,
            reviewDueAt: new Date(record.reviewDueAt),
            ruleId: record.ruleId,
            tenantId: record.tenantId,
            updatedAt: record.occurredAt,
          })
          .onConflictDoNothing({
            target: [reviewCases.tenantId, reviewCases.externalReference],
          })
          .returning({
            createdAt: reviewCases.createdAt,
            externalReference: reviewCases.externalReference,
            fingerprint: reviewCases.intakeFingerprint,
            id: reviewCases.id,
            reviewDueAt: reviewCases.reviewDueAt,
            status: reviewCases.status,
          });

        if (created) {
          await transaction.insert(reviewEvents).values({
            actorId: record.actorId,
            caseId: record.caseId,
            createdAt: record.occurredAt,
            eventHash: record.eventHash,
            eventType: "case_created",
            payload: {
              automatedSystemVersion: record.automatedSystemVersion,
              evidence: record.evidence,
              externalReference: record.externalReference,
              policyVersion: record.policyVersion,
              recommendation: record.recommendation,
              riskLevel: record.riskLevel,
              ruleId: record.ruleId,
            },
            previousHash: null,
            tenantId: record.tenantId,
          });

          return { created: true, reviewCase: created };
        }

        const [existing] = await transaction
          .select({
            createdAt: reviewCases.createdAt,
            externalReference: reviewCases.externalReference,
            fingerprint: reviewCases.intakeFingerprint,
            id: reviewCases.id,
            reviewDueAt: reviewCases.reviewDueAt,
            status: reviewCases.status,
          })
          .from(reviewCases)
          .where(
            and(
              eq(reviewCases.tenantId, record.tenantId),
              eq(reviewCases.externalReference, record.externalReference),
            ),
          )
          .limit(1);

        if (!existing) {
          throw new Error("Review intake conflict could not be resolved.");
        }

        return { created: false, reviewCase: existing };
      });
    },
  };
}

export function createPostgresReviewWorkflowStore(database: Database): ReviewWorkflowStore {
  return {
    async exportCase(tenantId, caseId) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const row = await selectCase(transaction, tenantId, caseId);
        if (!row) {
          return null;
        }

        const detail = mapDetail(row as unknown as Record<string, unknown>);
        const events = await transaction
          .select({
            actorId: reviewEvents.actorId,
            createdAt: reviewEvents.createdAt,
            eventHash: reviewEvents.eventHash,
            eventSequence: reviewEvents.eventSequence,
            eventType: reviewEvents.eventType,
            payload: reviewEvents.payload,
            previousHash: reviewEvents.previousHash,
          })
          .from(reviewEvents)
          .where(and(eq(reviewEvents.tenantId, tenantId), eq(reviewEvents.caseId, caseId)))
          .orderBy(asc(reviewEvents.eventSequence));

        const base = {
          case: {
            assignedToUserId: detail.assignedToUserId,
            automatedSystemVersion: detail.automatedSystemVersion,
            createdAt: detail.createdAt.toISOString(),
            evidence: detail.evidence,
            externalReference: detail.externalReference,
            finalRecommendation: detail.finalRecommendation,
            id: detail.id,
            policyVersion: detail.policyVersion,
            recommendation: detail.recommendation,
            reviewDueAt: detail.reviewDueAt?.toISOString() ?? null,
            riskLevel: detail.riskLevel,
            ruleId: detail.ruleId,
            status: detail.status,
          },
          events: events.map((event) => ({
            actorId: event.actorId,
            createdAt: event.createdAt.toISOString(),
            eventHash: event.eventHash,
            eventSequence: event.eventSequence,
            eventType: event.eventType,
            payload: event.payload,
            previousHash: event.previousHash,
          })),
          schemaVersion: "hollis.review-export.v1" as const,
        };

        return {
          ...base,
          manifestHash: hashEvent(base),
        } satisfies ReviewExport;
      });
    },

    async list(tenantId, status) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const rows = await transaction
          .select({
            assignedToUserId: reviewCases.assignedToUserId,
            createdAt: reviewCases.createdAt,
            externalReference: reviewCases.externalReference,
            id: reviewCases.id,
            recommendation: reviewCases.recommendation,
            reviewDueAt: reviewCases.reviewDueAt,
            riskLevel: reviewCases.riskLevel,
            status: reviewCases.status,
          })
          .from(reviewCases)
          .where(
            and(
              eq(reviewCases.tenantId, tenantId),
              status ? eq(reviewCases.status, status) : not(eq(reviewCases.status, "completed")),
            ),
          )
          .orderBy(
            sql`case ${reviewCases.riskLevel}
              when 'critical' then 0
              when 'high' then 1
              when 'medium' then 2
              else 3 end`,
            sql`${reviewCases.reviewDueAt} asc nulls last`,
            asc(reviewCases.createdAt),
          );

        return rows.map((row) => ({
          ...row,
          recommendation: recommendationSchema.parse(row.recommendation),
          riskLevel: riskLevelSchema.parse(row.riskLevel),
        }));
      });
    },

    async get(tenantId, caseId) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const row = await selectCase(transaction, tenantId, caseId);
        return row ? mapDetail(row as unknown as Record<string, unknown>) : null;
      });
    },

    async claim(tenantId, actorId, caseId) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const current = await selectCase(transaction, tenantId, caseId);
        if (!current) {
          throw new ReviewCaseNotFoundError();
        }

        if (current.status === "in_review" && current.assignedToUserId === actorId) {
          return { case: mapDetail(current as unknown as Record<string, unknown>), replayed: true };
        }

        if (current.status !== "pending" && current.status !== "escalated") {
          throw new ReviewCaseTransitionError();
        }

        const occurredAt = new Date();
        const [updated] = await transaction
          .update(reviewCases)
          .set({
            assignedAt: occurredAt,
            assignedToUserId: actorId,
            status: "in_review",
            updatedAt: occurredAt,
          })
          .where(
            and(
              eq(reviewCases.tenantId, tenantId),
              eq(reviewCases.id, caseId),
              inArray(reviewCases.status, ["pending", "escalated"]),
            ),
          )
          .returning({ id: reviewCases.id });

        if (!updated) {
          throw new ReviewCaseTransitionError();
        }

        await appendEvent(transaction, {
          actorId,
          caseId,
          eventType: "review_started",
          occurredAt,
          payload: { assignedToUserId: actorId },
          tenantId,
        });
        const next = await selectCase(transaction, tenantId, caseId);
        if (!next) {
          throw new ReviewCaseNotFoundError();
        }

        return { case: mapDetail(next as unknown as Record<string, unknown>), replayed: false };
      });
    },

    async escalate(tenantId, actorId, caseId, input) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const current = await selectCase(transaction, tenantId, caseId);
        if (!current) {
          throw new ReviewCaseNotFoundError();
        }

        if (
          current.status === "escalated" &&
          current.escalatedByUserId === actorId &&
          current.escalationReason === input.reason
        ) {
          return { case: mapDetail(current as unknown as Record<string, unknown>), replayed: true };
        }

        if (current.status !== "in_review" || current.assignedToUserId !== actorId) {
          throw new ReviewCaseTransitionError();
        }

        const occurredAt = new Date();
        const [updated] = await transaction
          .update(reviewCases)
          .set({
            escalationReason: input.reason,
            escalatedAt: occurredAt,
            escalatedByUserId: actorId,
            status: "escalated",
            updatedAt: occurredAt,
          })
          .where(
            and(
              eq(reviewCases.tenantId, tenantId),
              eq(reviewCases.id, caseId),
              eq(reviewCases.status, "in_review"),
              eq(reviewCases.assignedToUserId, actorId),
            ),
          )
          .returning({ id: reviewCases.id });

        if (!updated) {
          throw new ReviewCaseTransitionError();
        }

        await appendEvent(transaction, {
          actorId,
          caseId,
          eventType: "case_escalated",
          occurredAt,
          payload: { reason: input.reason },
          tenantId,
        });
        const next = await selectCase(transaction, tenantId, caseId);
        if (!next) {
          throw new ReviewCaseNotFoundError();
        }

        return { case: mapDetail(next as unknown as Record<string, unknown>), replayed: false };
      });
    },

    async decide(tenantId, actorId, caseId, input) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const current = await selectCase(transaction, tenantId, caseId);
        if (!current) {
          throw new ReviewCaseNotFoundError();
        }

        if (
          current.status === "completed" &&
          current.decidedByUserId === actorId &&
          current.decisionOutcome === input.outcome &&
          current.decisionRationale === input.rationale &&
          current.finalRecommendation === input.finalRecommendation
        ) {
          return { case: mapDetail(current as unknown as Record<string, unknown>), replayed: true };
        }

        if (current.status !== "in_review" || current.assignedToUserId !== actorId) {
          throw new ReviewCaseTransitionError();
        }

        const occurredAt = new Date();
        const [updated] = await transaction
          .update(reviewCases)
          .set({
            decisionOutcome: input.outcome,
            decisionRationale: input.rationale,
            decidedAt: occurredAt,
            decidedByUserId: actorId,
            finalRecommendation: input.finalRecommendation,
            status: "completed",
            updatedAt: occurredAt,
          })
          .where(
            and(
              eq(reviewCases.tenantId, tenantId),
              eq(reviewCases.id, caseId),
              eq(reviewCases.status, "in_review"),
              eq(reviewCases.assignedToUserId, actorId),
            ),
          )
          .returning({ id: reviewCases.id });

        if (!updated) {
          throw new ReviewCaseTransitionError();
        }

        await appendEvent(transaction, {
          actorId,
          caseId,
          eventType: "decision_recorded",
          occurredAt,
          payload: {
            automatedSystemVersion: current.automatedSystemVersion,
            decisionOutcome: input.outcome,
            evidence: parseEvidence(current.evidence),
            finalRecommendation: input.finalRecommendation,
            policyVersion: current.policyVersion,
            rationale: input.rationale,
            recommendation: current.recommendation,
            reviewDueAt: current.reviewDueAt?.toISOString() ?? null,
            reviewerId: actorId,
            riskLevel: current.riskLevel,
            ruleId: current.ruleId,
          },
          tenantId,
        });
        const next = await selectCase(transaction, tenantId, caseId);
        if (!next) {
          throw new ReviewCaseNotFoundError();
        }

        return { case: mapDetail(next as unknown as Record<string, unknown>), replayed: false };
      });
    },
  };
}

export function createPostgresEvidenceMetadataStore(database: Database): EvidenceMetadataStore {
  return {
    async create(tenantId, caseId, input: EvidenceUpload & { objectName: string }) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const reviewCase = await selectCase(transaction, tenantId, caseId);
        if (!reviewCase) throw new Error("Review case was not found.");
        const [created] = await transaction
          .insert(evidenceObjects)
          .values({ ...input, caseId, tenantId })
          .onConflictDoNothing({ target: [evidenceObjects.tenantId, evidenceObjects.digest] })
          .returning({ id: evidenceObjects.id });
        if (created) return created;
        const [existing] = await transaction
          .select({ id: evidenceObjects.id })
          .from(evidenceObjects)
          .where(
            and(eq(evidenceObjects.tenantId, tenantId), eq(evidenceObjects.digest, input.digest)),
          )
          .limit(1);
        if (!existing) throw new Error("Evidence metadata could not be stored.");
        return existing;
      });
    },
    async markVerified(tenantId, caseId, evidenceId) {
      await database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        await transaction
          .update(evidenceObjects)
          .set({ verified: true })
          .where(
            and(
              eq(evidenceObjects.tenantId, tenantId),
              eq(evidenceObjects.caseId, caseId),
              eq(evidenceObjects.id, evidenceId),
            ),
          );
      });
    },
    async get(tenantId, caseId, evidenceId) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const [row] = await transaction
          .select({
            digest: evidenceObjects.digest,
            id: evidenceObjects.id,
            mediaType: evidenceObjects.mediaType,
            objectName: evidenceObjects.objectName,
            sizeBytes: evidenceObjects.sizeBytes,
            verified: evidenceObjects.verified,
          })
          .from(evidenceObjects)
          .where(
            and(
              eq(evidenceObjects.tenantId, tenantId),
              eq(evidenceObjects.caseId, caseId),
              eq(evidenceObjects.id, evidenceId),
            ),
          )
          .limit(1);
        return row ?? null;
      });
    },
  };
}
