import {
  attestationRecordSchema,
  evidenceReferenceSchema,
  publicAttestationCaseFileSchema,
  recommendationSchema,
  type ReviewExport,
  riskLevelSchema,
  reviewCaseStatusSchema,
  reviewOutcomeSchema,
} from "@hollis/contracts";
import {
  attestations,
  evidenceObjects,
  retentionDeletionJobs,
  reviewCases,
  reviewEvents,
  publicAttestationCaseFiles,
  tenants,
} from "@hollis/database";
import { and, asc, desc, eq, inArray, not, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { createDatabase } from "@hollis/database";
import type { ReviewIntakeRecord, ReviewIntakeStore, TenantResolver } from "./review-intake.js";
import type { EvidenceMetadataStore, EvidenceUpload } from "./evidence.js";
import type { AttestationReceipt } from "@hollis/contracts";
import type { AttestationStore, PublicAttestationCaseFileStore } from "./attestation.js";
import type { RetentionDeletionJobStore, RetentionDeletionJob } from "./retention-worker.js";
import type {
  WorkspaceProvisioningRecord,
  WorkspaceProvisioningStore,
} from "./workspace-provisioning.js";
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
    eventType:
      | "review_started"
      | "case_escalated"
      | "decision_recorded"
      | "retention_deletion_requested"
      | "evidence_deleted"
      | "legal_hold_changed"
      | "attestation_recorded"
      | "attestation_updated"
      | "attestation_case_file_published";
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

export function createPostgresWorkspaceProvisioningStore(
  database: Database,
): WorkspaceProvisioningStore {
  return {
    async provision(input) {
      const [record] = await database.execute<WorkspaceProvisioningRecord>(sql`
        select *
        from provision_hollis_tenant(
          ${input.organizationName},
          ${input.organizationId},
          ${input.creatorUserId},
          ${input.membershipId},
          ${input.role}
        )
      `);
      if (!record) throw new Error("Workspace provisioning did not return a tenant.");
      return record;
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
            assignedAt: detail.assignedAt?.toISOString() ?? null,
            assignedToUserId: detail.assignedToUserId,
            automatedSystemVersion: detail.automatedSystemVersion,
            createdAt: detail.createdAt.toISOString(),
            decisionOutcome: detail.decisionOutcome,
            decisionRationale: detail.decisionRationale,
            decidedAt: detail.decidedAt?.toISOString() ?? null,
            decidedByUserId: detail.decidedByUserId,
            evidence: detail.evidence,
            escalatedAt: detail.escalatedAt?.toISOString() ?? null,
            escalatedByUserId: detail.escalatedByUserId,
            escalationReason: detail.escalationReason,
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
    async list(tenantId, caseId) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        return transaction
          .select({
            digest: evidenceObjects.digest,
            mediaType: evidenceObjects.mediaType,
            verified: evidenceObjects.verified,
          })
          .from(evidenceObjects)
          .where(and(eq(evidenceObjects.tenantId, tenantId), eq(evidenceObjects.caseId, caseId)))
          .orderBy(asc(evidenceObjects.createdAt));
      });
    },
  };
}

export function createPostgresAttestationStore(database: Database): AttestationStore {
  return {
    async create(tenantId, caseId, actorId, caseFile, publicCaseFileUrl, receipt) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const reviewCase = await selectCase(transaction, tenantId, caseId);
        if (!reviewCase) throw new ReviewCaseNotFoundError();

        const [created] = await transaction
          .insert(attestations)
          .values({
            caseCommitment: caseFile.caseCommitment,
            caseFile,
            caseId,
            contractAddress: receipt.contractAddress,
            provider: receipt.provider,
            providerSubmissionId: receipt.providerSubmissionId,
            publicCaseFileUrl,
            status: receipt.status,
            tenantId,
            transactionHash: receipt.transactionHash,
            verdict: receipt.verdict,
          })
          .onConflictDoNothing({
            target: [attestations.provider, attestations.providerSubmissionId],
          })
          .returning();
        const row =
          created ??
          (
            await transaction
              .select()
              .from(attestations)
              .where(
                and(
                  eq(attestations.tenantId, tenantId),
                  eq(attestations.provider, receipt.provider),
                  eq(attestations.providerSubmissionId, receipt.providerSubmissionId),
                ),
              )
              .limit(1)
          )[0];
        if (!row) throw new Error("Attestation record could not be stored.");

        if (created) {
          await appendEvent(transaction, {
            actorId,
            caseId,
            eventType: "attestation_recorded",
            occurredAt: row.createdAt,
            payload: {
              attestationId: row.id,
              caseCommitment: row.caseCommitment,
              provider: row.provider,
              providerSubmissionId: row.providerSubmissionId,
              status: row.status,
              transactionHash: row.transactionHash,
              verdict: row.verdict,
            },
            tenantId,
          });
        }

        return attestationRecordSchema.parse({
          caseCommitment: row.caseCommitment,
          contractAddress: row.contractAddress,
          createdAt: row.createdAt.toISOString(),
          id: row.id,
          provider: row.provider,
          providerSubmissionId: row.providerSubmissionId,
          publicCaseFileUrl: row.publicCaseFileUrl,
          status: row.status,
          transactionHash: row.transactionHash,
          updatedAt: row.updatedAt.toISOString(),
          verdict: row.verdict,
        });
      });
    },
    async list(tenantId, caseId) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const rows = await transaction
          .select()
          .from(attestations)
          .where(and(eq(attestations.tenantId, tenantId), eq(attestations.caseId, caseId)))
          .orderBy(desc(attestations.createdAt));
        return rows.map((row) =>
          attestationRecordSchema.parse({
            caseCommitment: row.caseCommitment,
            contractAddress: row.contractAddress,
            createdAt: row.createdAt.toISOString(),
            id: row.id,
            provider: row.provider,
            providerSubmissionId: row.providerSubmissionId,
            publicCaseFileUrl: row.publicCaseFileUrl,
            status: row.status,
            transactionHash: row.transactionHash,
            updatedAt: row.updatedAt.toISOString(),
            verdict: row.verdict,
          }),
        );
      });
    },
    async update(tenantId, caseId, attestationId, receipt: AttestationReceipt) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const [updated] = await transaction
          .update(attestations)
          .set({
            contractAddress: receipt.contractAddress,
            provider: receipt.provider,
            providerSubmissionId: receipt.providerSubmissionId,
            status: receipt.status,
            transactionHash: receipt.transactionHash,
            updatedAt: new Date(),
            verdict: receipt.verdict,
          })
          .where(
            and(
              eq(attestations.tenantId, tenantId),
              eq(attestations.caseId, caseId),
              eq(attestations.id, attestationId),
            ),
          )
          .returning();
        if (!updated) return null;
        await appendEvent(transaction, {
          actorId: "attestation-provider",
          caseId,
          eventType: "attestation_updated",
          occurredAt: updated.updatedAt,
          payload: {
            attestationId,
            providerSubmissionId: updated.providerSubmissionId,
            status: updated.status,
            verdict: updated.verdict,
          },
          tenantId,
        });
        return attestationRecordSchema.parse({
          caseCommitment: updated.caseCommitment,
          contractAddress: updated.contractAddress,
          createdAt: updated.createdAt.toISOString(),
          id: updated.id,
          provider: updated.provider,
          providerSubmissionId: updated.providerSubmissionId,
          publicCaseFileUrl: updated.publicCaseFileUrl,
          status: updated.status,
          transactionHash: updated.transactionHash,
          updatedAt: updated.updatedAt.toISOString(),
          verdict: updated.verdict,
        });
      });
    },
  };
}

export function createPostgresPublicAttestationCaseFileStore(
  database: Database,
): PublicAttestationCaseFileStore {
  return {
    async create(tenantId, caseId, actorId, publicId, caseFile, publicCaseFileUrl) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const reviewCase = await selectCase(transaction, tenantId, caseId);
        if (!reviewCase) throw new ReviewCaseNotFoundError();

        const [created] = await transaction
          .insert(publicAttestationCaseFiles)
          .values({
            caseCommitment: caseFile.caseCommitment,
            caseFile,
            caseId,
            publicId,
            tenantId,
          })
          .returning();
        if (!created) throw new Error("Public attestation case file could not be stored.");

        await appendEvent(transaction, {
          actorId,
          caseId,
          eventType: "attestation_case_file_published",
          occurredAt: created.createdAt,
          payload: {
            caseCommitment: created.caseCommitment,
            publicId: created.publicId,
          },
          tenantId,
        });

        return publicAttestationCaseFileSchema.parse({
          caseFile: created.caseFile,
          createdAt: created.createdAt.toISOString(),
          publicCaseFileUrl,
          publicId: created.publicId,
        });
      });
    },
    async findForCase(tenantId, caseId, publicId, publicCaseFileUrl) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const [row] = await transaction
          .select()
          .from(publicAttestationCaseFiles)
          .where(
            and(
              eq(publicAttestationCaseFiles.tenantId, tenantId),
              eq(publicAttestationCaseFiles.caseId, caseId),
              eq(publicAttestationCaseFiles.publicId, publicId),
              sql`${publicAttestationCaseFiles.revokedAt} is null`,
            ),
          )
          .limit(1);
        if (!row) return null;

        return publicAttestationCaseFileSchema.parse({
          caseFile: row.caseFile,
          createdAt: row.createdAt.toISOString(),
          publicCaseFileUrl,
          publicId: row.publicId,
        });
      });
    },
    async findPublic(publicId, publicCaseFileUrl) {
      return database.transaction(async (transaction) => {
        await transaction.execute(
          sql`select set_config('app.public_attestation_case_file_id', ${publicId}, true)`,
        );
        const [row] = await transaction
          .select()
          .from(publicAttestationCaseFiles)
          .where(eq(publicAttestationCaseFiles.publicId, publicId))
          .limit(1);
        if (!row) return null;

        return publicAttestationCaseFileSchema.parse({
          caseFile: row.caseFile,
          createdAt: row.createdAt.toISOString(),
          publicCaseFileUrl,
          publicId: row.publicId,
        });
      });
    },
    async list(tenantId, caseId, publicOrigin) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const rows = await transaction
          .select()
          .from(publicAttestationCaseFiles)
          .where(
            and(
              eq(publicAttestationCaseFiles.tenantId, tenantId),
              eq(publicAttestationCaseFiles.caseId, caseId),
              sql`${publicAttestationCaseFiles.revokedAt} is null`,
            ),
          )
          .orderBy(desc(publicAttestationCaseFiles.createdAt));
        return rows.map((row) =>
          publicAttestationCaseFileSchema.parse({
            caseFile: row.caseFile,
            createdAt: row.createdAt.toISOString(),
            publicCaseFileUrl: new URL(
              `/v1/public/attestation-case-files/${row.publicId}`,
              publicOrigin,
            ).toString(),
            publicId: row.publicId,
          }),
        );
      });
    },
  };
}

export function createPostgresRetentionDeletionJobStore(
  database: Database,
): RetentionDeletionJobStore {
  return {
    async claimNext(tenantId) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const [job] = await transaction.execute<RetentionDeletionJob>(sql`
          with candidate as (
            select id
            from retention_deletion_jobs
            where tenant_id = ${tenantId}::uuid
              and status in ('pending', 'failed')
              and available_at <= now()
            order by available_at, created_at
            for update skip locked
            limit 1
          )
          update retention_deletion_jobs job
          set status = 'processing', claimed_at = now(), attempts = job.attempts + 1
          from candidate
          where job.id = candidate.id
          returning job.evidence_id as "evidenceId", job.id as "jobId",
            job.object_name as "objectName", job.tenant_id as "tenantId"
        `);
        return job ?? null;
      });
    },
    async markCompleted(tenantId, jobId) {
      await database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const [job] = await transaction
          .update(retentionDeletionJobs)
          .set({ completedAt: new Date(), status: "completed" })
          .where(
            and(
              eq(retentionDeletionJobs.tenantId, tenantId),
              eq(retentionDeletionJobs.id, jobId),
              eq(retentionDeletionJobs.status, "processing"),
            ),
          )
          .returning({
            caseId: retentionDeletionJobs.caseId,
            evidenceId: retentionDeletionJobs.evidenceId,
          });
        if (!job) throw new Error("Retention deletion job is not claimable.");
        await appendEvent(transaction, {
          actorId: "retention-system",
          caseId: job.caseId,
          eventType: "evidence_deleted",
          occurredAt: new Date(),
          payload: { evidenceId: job.evidenceId, jobId },
          tenantId,
        });
      });
    },
    async markFailed(tenantId, jobId, reason) {
      await database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        await transaction
          .update(retentionDeletionJobs)
          .set({
            availableAt: new Date(Date.now() + 5 * 60 * 1000),
            lastError: reason,
            status: "failed",
          })
          .where(
            and(
              eq(retentionDeletionJobs.tenantId, tenantId),
              eq(retentionDeletionJobs.id, jobId),
              eq(retentionDeletionJobs.status, "processing"),
            ),
          );
      });
    },
  };
}

export async function requestRetentionDeletion(
  database: Database,
  tenantId: string,
  caseId: string,
  evidenceId: string,
): Promise<string | null> {
  return database.transaction(async (transaction) => {
    await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    const [candidate] = await transaction
      .select({
        objectName: evidenceObjects.objectName,
        retentionUntil: evidenceObjects.retentionUntil,
      })
      .from(evidenceObjects)
      .innerJoin(reviewCases, eq(reviewCases.id, evidenceObjects.caseId))
      .where(
        and(
          eq(evidenceObjects.tenantId, tenantId),
          eq(evidenceObjects.caseId, caseId),
          eq(evidenceObjects.id, evidenceId),
          eq(evidenceObjects.verified, true),
          eq(evidenceObjects.legalHold, "none"),
          eq(reviewCases.tenantId, tenantId),
          eq(reviewCases.status, "completed"),
          sql`${evidenceObjects.retentionUntil} <= now()`,
        ),
      )
      .limit(1);
    if (!candidate) return null;

    const [job] = await transaction
      .insert(retentionDeletionJobs)
      .values({ caseId, evidenceId, objectName: candidate.objectName, tenantId })
      .onConflictDoNothing({
        target: [retentionDeletionJobs.tenantId, retentionDeletionJobs.evidenceId],
      })
      .returning({ id: retentionDeletionJobs.id });
    if (!job) return null;
    await appendEvent(transaction, {
      actorId: "retention-system",
      caseId,
      eventType: "retention_deletion_requested",
      occurredAt: new Date(),
      payload: { evidenceId, jobId: job.id, retentionUntil: candidate.retentionUntil },
      tenantId,
    });
    return job.id;
  });
}

export async function setEvidenceLegalHold(
  database: Database,
  tenantId: string,
  caseId: string,
  evidenceId: string,
  active: boolean,
  actorId: string,
): Promise<boolean> {
  return database.transaction(async (transaction) => {
    await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    const [updated] = await transaction
      .update(evidenceObjects)
      .set({ legalHold: active ? "active" : "none" })
      .where(
        and(
          eq(evidenceObjects.tenantId, tenantId),
          eq(evidenceObjects.caseId, caseId),
          eq(evidenceObjects.id, evidenceId),
        ),
      )
      .returning({ id: evidenceObjects.id });
    if (!updated) return false;
    await appendEvent(transaction, {
      actorId,
      caseId,
      eventType: "legal_hold_changed",
      occurredAt: new Date(),
      payload: { active, evidenceId },
      tenantId,
    });
    return true;
  });
}
