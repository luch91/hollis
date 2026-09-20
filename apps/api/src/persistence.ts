import { createHash } from "node:crypto";
import type { AttestationReceipt, CreatePolicyVersion, PolicyVersion } from "@hollis/contracts";
import {
  attestationRecordSchema,
  evidenceReferenceSchema,
  managedAttestationSubmissionSchema,
  policyContractBindingSchema,
  policyContractDeploymentSchema,
  policyLibraryControlSchema,
  policySourceSchema,
  policyVersionSchema,
  publicAttestationCaseFileSchema,
  type ReviewExport,
  type PolicyContractDeployment,
  type ManagedAttestationSubmission,
  recommendationSchema,
  reviewCaseStatusSchema,
  reviewOutcomeSchema,
  riskLevelSchema,
} from "@hollis/contracts";
import type { createDatabase } from "@hollis/database";
import {
  attestations,
  evidenceAttachments,
  evidenceObjects,
  evidenceUploads,
  managedAttestationSubmissions,
  policyContractDeployments,
  policyControls,
  policyVersions,
  publicAttestationCaseFiles,
  retentionDeletionJobs,
  reviewCases,
  reviewEvents,
  tenantMemberships,
  tenants,
  users,
  workspaceAuditEvents,
  workspaceInvitations,
} from "@hollis/database";
import { and, asc, desc, eq, ilike, inArray, not, or, sql } from "drizzle-orm";
import type { AttestationStore, PublicAttestationCaseFileStore } from "./attestation.js";
import type { ApplicationSessionStore } from "./auth.js";
import type { EvidenceMetadataStore, EvidenceUpload } from "./evidence.js";
import { PolicyVersionConflictError, type PolicyLibraryStore } from "./policy-library.js";
import type { PolicyContractDeploymentStore } from "./policy-contract-deployment.js";
import type { ManagedAttestationSubmissionStore } from "./managed-attestation-submission.js";
import type { RetentionDeletionJob, RetentionDeletionJobStore } from "./retention-worker.js";
import type { ReviewIntakeRecord, ReviewIntakeStore, TenantResolver } from "./review-intake.js";
import type { WelcomeEmailDeliveryStore } from "./welcome-email-delivery.js";
import {
  type ReviewCaseDetail,
  ReviewCaseNotFoundError,
  ReviewCaseTransitionError,
  type ReviewWorkflowStore,
} from "./workflow.js";
import { digestInvitationToken } from "./workspace-controls.js";
import type {
  WorkspaceProvisioningRecord,
  WorkspaceProvisioningStore,
} from "./workspace-provisioning.js";

type Database = ReturnType<typeof createDatabase>["database"];
type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function isUniqueViolation(error: unknown): boolean {
  const candidate =
    error instanceof Error && typeof error.cause === "object" && error.cause !== null
      ? error.cause
      : error;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    "code" in candidate &&
    candidate.code === "23505"
  );
}

function samePublishedPolicy(existing: PolicyVersion, input: CreatePolicyVersion): boolean {
  if (
    existing.documentDigest !== input.documentDigest ||
    existing.policyId !== input.policyId ||
    existing.source?.fileName !== input.source.fileName ||
    existing.source?.mediaType !== input.source.mediaType ||
    existing.source?.sizeBytes !== input.source.sizeBytes ||
    existing.title !== input.title ||
    existing.version !== input.version ||
    existing.controls.length !== input.controls.length
  ) {
    return false;
  }
  const controlsById = new Map(existing.controls.map((control) => [control.controlId, control]));
  return input.controls.every((control) => {
    const existingControl = controlsById.get(control.controlId);
    return (
      existingControl?.attestationCriterion === control.attestationCriterion &&
      existingControl.controlVersion === control.controlVersion &&
      existingControl.evidenceRequirement === control.evidenceRequirement &&
      existingControl.interpretation === control.interpretation &&
      existingControl.title === control.title
    );
  });
}

function toPolicySource(input: {
  sourceFileName: string | null;
  sourceMediaType: string | null;
  sourceSizeBytes: number | null;
}) {
  const parsed = policySourceSchema.safeParse({
    fileName: input.sourceFileName,
    mediaType: input.sourceMediaType,
    sizeBytes: input.sourceSizeBytes,
  });
  return parsed.success ? parsed.data : null;
}

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
  evidenceFrozenAt: reviewCases.evidenceFrozenAt,
  escalatedAt: reviewCases.escalatedAt,
  escalatedByUserId: reviewCases.escalatedByUserId,
  escalationReason: reviewCases.escalationReason,
  externalReference: reviewCases.externalReference,
  finalRecommendation: reviewCases.finalRecommendation,
  hollisCaseReference: reviewCases.hollisCaseReference,
  id: reviewCases.id,
  policyId: reviewCases.policyId,
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

function mapPolicyContractDeployment(
  row: typeof policyContractDeployments.$inferSelect,
): PolicyContractDeployment {
  return policyContractDeploymentSchema.parse({
    ...row,
    activatedAt: row.activatedAt?.toISOString() ?? null,
    binding: policyContractBindingSchema.parse(row.binding),
    createdAt: row.createdAt.toISOString(),
    finalizedAt: row.finalizedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
  });
}

function mapManagedAttestationSubmission(
  row: typeof managedAttestationSubmissions.$inferSelect,
): ManagedAttestationSubmission {
  return managedAttestationSubmissionSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    finalizedAt: row.finalizedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  });
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
      | "evidence_added"
      | "evidence_verified"
      | "evidence_upload_failed"
      | "evidence_removed"
      | "evidence_superseded"
      | "evidence_quarantine_cleaned"
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
    async findByTenantId(tenantId) {
      const tenant = await database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const [resolved] = await transaction
          .select({ id: tenants.id })
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);

        return resolved;
      });

      return tenant ?? null;
    },
  };
}

type SessionFunctionRecord = {
  isNewUser: boolean;
  role: string | null;
  sessionId: string;
  tenantId: string | null;
  userId: string;
  workspaceName: string | null;
};

export function createPostgresApplicationSessionStore(database: Database): ApplicationSessionStore {
  return {
    async activate(tokenDigest, tenantId) {
      const [record] = await database.execute<SessionFunctionRecord>(sql`
        select *
        from public.activate_hollis_workspace(${tokenDigest}, ${tenantId}::uuid)
      `);
      return record ?? null;
    },
    async establish(input) {
      const [record] = await database.execute<SessionFunctionRecord>(sql`
        select *
        from public.establish_hollis_application_session(
          ${input.subject},
          ${input.email},
          true,
          ${input.displayName ?? ""},
          ${input.avatarUrl ?? ""},
          ${input.tokenDigest},
          ${input.expiresAt.toISOString()}
        )
      `);
      if (!record) throw new Error("Application session could not be established.");
      return record;
    },
    async read(tokenDigest) {
      const [record] = await database.execute<SessionFunctionRecord>(sql`
        select *
        from public.read_hollis_application_session(${tokenDigest})
      `);
      return record ?? null;
    },
    async revoke(tokenDigest) {
      const [record] = await database.execute<{ revoke_hollis_application_session: boolean }>(sql`
        select public.revoke_hollis_application_session(${tokenDigest})
      `);
      return record?.revoke_hollis_application_session ?? false;
    },
  };
}

export function createPostgresWelcomeEmailDeliveryStore(
  database: Database,
): WelcomeEmailDeliveryStore {
  return {
    async recordNewUser(userId) {
      await database.execute(
        sql`select public.record_hollis_welcome_email_delivery(${userId}::uuid)`,
      );
    },
    async claimPending(userId) {
      const [record] = await database.execute<{
        deliveryId: string;
        recipientEmail: string;
      }>(sql`
        select *
        from public.claim_hollis_welcome_email_delivery(${userId}::uuid)
      `);
      return record ?? null;
    },
    async markSent(deliveryId, providerMessageId) {
      await database.execute(sql`
        select public.complete_hollis_welcome_email_delivery(
          ${deliveryId}::uuid,
          'sent'::public.notification_delivery_status,
          ${providerMessageId}
        )
      `);
    },
    async markFailed(deliveryId) {
      await database.execute(sql`
        select public.complete_hollis_welcome_email_delivery(
          ${deliveryId}::uuid,
          'failed'::public.notification_delivery_status,
          null
        )
      `);
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
        from provision_public_hollis_workspace(${input.name}, ${input.creatorUserId}::uuid)
      `);
      if (!record) throw new Error("Workspace provisioning did not return a tenant.");
      return record;
    },
  };
}

export function createPostgresWorkspaceControlsStore(database: Database) {
  return {
    async getMemberIdentity(tenantId: string, actorId: string, userId: string) {
      const [record] = await database.execute<{
        avatarUrl: string | null;
        displayName: string | null;
        email: string | null;
        role: string;
        userId: string;
      }>(
        sql`select * from public.get_hollis_workspace_member_identity(${tenantId}::uuid, ${actorId}::uuid, ${userId})`,
      );
      return record ?? null;
    },
    async getProfile(tenantId: string) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const [record] = await transaction
          .select({
            id: tenants.id,
            name: tenants.name,
            industry: tenants.industry,
            logoDigest: tenants.logoDigest,
            logoMediaType: tenants.logoMediaType,
            logoObjectName: tenants.logoObjectName,
            logoSourceHost: tenants.logoSourceHost,
            logoUpdatedAt: tenants.logoUpdatedAt,
            operatingRegion: tenants.operatingRegion,
            website: tenants.website,
          })
          .from(tenants)
          .where(eq(tenants.id, tenantId));
        return record ?? null;
      });
    },
    async updateProfile(
      tenantId: string,
      actorId: string,
      input: { name: string; industry: string; operatingRegion: string; website: string },
    ) {
      const [record] = await database.execute(
        sql`select * from public.update_hollis_workspace_profile(${tenantId}::uuid, ${actorId}::uuid, ${input.name}, ${input.industry}, ${input.operatingRegion}, ${input.website})`,
      );
      return record ?? null;
    },
    async setLogo(
      tenantId: string,
      actorId: string,
      input: {
        digest: string;
        mediaType: "image/jpeg" | "image/png" | "image/webp";
        objectName: string;
        sourceHost: string;
      },
    ) {
      const [record] = await database.execute<{
        id: string;
        logoDigest: string;
        logoMediaType: string;
        logoObjectName: string;
        logoSourceHost: string;
        logoUpdatedAt: Date;
      }>(
        sql`select * from public.set_hollis_workspace_logo(${tenantId}::uuid, ${actorId}::uuid, ${input.objectName}, ${input.digest}, ${input.mediaType}, ${input.sourceHost})`,
      );
      return record ?? null;
    },
    async removeLogo(tenantId: string, actorId: string) {
      const [record] = await database.execute<{ objectName: string }>(
        sql`select * from public.remove_hollis_workspace_logo(${tenantId}::uuid, ${actorId}::uuid)`,
      );
      return record?.objectName ?? null;
    },
    async listMembers(tenantId: string, actorId: string) {
      return database.execute<{
        userId: string;
        role: string;
        displayName: string | null;
        email: string | null;
        avatarUrl: string | null;
        joinedAt: Date;
      }>(
        sql`select * from public.list_hollis_workspace_members(${tenantId}::uuid, ${actorId}::uuid)`,
      );
    },
    async searchMembers(tenantId: string, query: string) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const pattern = `%${query}%`;
        return transaction
          .select({
            displayName: users.displayName,
            email: users.email,
            role: tenantMemberships.role,
            userId: users.id,
          })
          .from(tenantMemberships)
          .innerJoin(users, eq(users.id, tenantMemberships.userId))
          .where(
            and(
              eq(tenantMemberships.tenantId, tenantId),
              or(ilike(users.displayName, pattern), ilike(users.email, pattern)),
            ),
          )
          .orderBy(asc(users.displayName), asc(users.email))
          .limit(20);
      });
    },
    async createInvitation(
      tenantId: string,
      actorId: string,
      input: { email: string; role: string; token: string },
    ) {
      const [record] = await database.execute(
        sql`select * from public.create_hollis_workspace_invitation(${tenantId}::uuid, ${actorId}::uuid, ${input.email}, ${input.role}, ${digestInvitationToken(input.token)})`,
      );
      return record ?? null;
    },
    async listInvitations(tenantId: string) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        return transaction
          .select({
            id: workspaceInvitations.id,
            email: workspaceInvitations.email,
            role: workspaceInvitations.role,
            expiresAt: workspaceInvitations.expiresAt,
            acceptedAt: workspaceInvitations.acceptedAt,
            revokedAt: workspaceInvitations.revokedAt,
            createdAt: workspaceInvitations.createdAt,
          })
          .from(workspaceInvitations)
          .where(eq(workspaceInvitations.tenantId, tenantId))
          .orderBy(desc(workspaceInvitations.createdAt));
      });
    },
    async revokeInvitation(tenantId: string, actorId: string, invitationId: string) {
      const [record] = await database.execute<{ revoke_hollis_workspace_invitation: boolean }>(
        sql`select public.revoke_hollis_workspace_invitation(${tenantId}::uuid, ${actorId}::uuid, ${invitationId}::uuid)`,
      );
      return record?.revoke_hollis_workspace_invitation ?? false;
    },
    async changeMemberRole(tenantId: string, actorId: string, memberId: string, role: string) {
      const [record] = await database.execute(
        sql`select * from public.update_hollis_workspace_member_role(${tenantId}::uuid, ${actorId}::uuid, ${memberId}::uuid, ${role})`,
      );
      return record ?? null;
    },
    async acceptInvitation(token: string, userId: string) {
      const [record] = await database.execute<{
        tenantId: string;
        workspaceName: string;
        role: string;
      }>(
        sql`select * from public.accept_hollis_workspace_invitation(${digestInvitationToken(token)}, ${userId}::uuid)`,
      );
      return record ?? null;
    },
    async listUserWorkspaces(userId: string) {
      return database.execute<{ tenantId: string; workspaceName: string; role: string }>(
        sql`select * from public.list_hollis_user_workspaces(${userId}::uuid)`,
      );
    },
    async listAuditEvents(tenantId: string) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        return transaction
          .select({
            actorId: workspaceAuditEvents.actorId,
            createdAt: workspaceAuditEvents.createdAt,
            eventHash: workspaceAuditEvents.eventHash,
            eventSequence: workspaceAuditEvents.eventSequence,
            eventType: workspaceAuditEvents.eventType,
            payload: workspaceAuditEvents.payload,
            previousHash: workspaceAuditEvents.previousHash,
          })
          .from(workspaceAuditEvents)
          .where(eq(workspaceAuditEvents.tenantId, tenantId))
          .orderBy(desc(workspaceAuditEvents.eventSequence))
          .limit(100);
      });
    },
  };
}

export function createPostgresUserProfileStore(database: Database) {
  return {
    async get(userId: string) {
      const [record] = await database.execute<{
        avatarUrl: string | null;
        bio: string | null;
        displayName: string | null;
        email: string | null;
        emailVerifiedAt: Date | null;
        jobTitle: string | null;
        profileAvatarDigest: string | null;
        profileAvatarMediaType: string | null;
        profileAvatarObjectName: string | null;
        profileAvatarTenantId: string | null;
        profileAvatarUpdatedAt: Date | null;
        timeZone: string | null;
      }>(sql`select * from public.get_hollis_user_profile(${userId}::uuid)`);
      return record ?? null;
    },
    async update(
      userId: string,
      input: { bio: string; displayName: string; jobTitle: string; timeZone: string },
    ) {
      const [record] = await database.execute<{
        avatarUrl: string | null;
        bio: string | null;
        displayName: string | null;
        email: string | null;
        emailVerifiedAt: Date | null;
        jobTitle: string | null;
        profileAvatarDigest: string | null;
        profileAvatarMediaType: string | null;
        profileAvatarObjectName: string | null;
        profileAvatarTenantId: string | null;
        profileAvatarUpdatedAt: Date | null;
        timeZone: string | null;
      }>(sql`select * from public.update_hollis_user_profile(
        ${userId}::uuid,
        ${input.displayName},
        ${input.jobTitle},
        ${input.timeZone},
        ${input.bio}
      )`);
      return record ?? null;
    },
    async setAvatar(
      userId: string,
      input: {
        digest: string;
        mediaType: "image/jpeg" | "image/png" | "image/webp";
        objectName: string;
        tenantId: string;
      },
    ) {
      const [record] = await database.execute<{
        previousObjectName: string | null;
        previousTenantId: string | null;
      }>(
        sql`select * from public.set_hollis_user_profile_avatar(
          ${userId}::uuid,
          ${input.tenantId}::uuid,
          ${input.objectName},
          ${input.digest},
          ${input.mediaType}
        )`,
      );
      return record ?? null;
    },
    async removeAvatar(userId: string) {
      const [record] = await database.execute<{
        previousObjectName: string | null;
        previousTenantId: string | null;
      }>(sql`select * from public.remove_hollis_user_profile_avatar(${userId}::uuid)`);
      return record ?? null;
    },
  };
}

export function createPostgresPolicyLibraryStore(database: Database): PolicyLibraryStore {
  async function findByIdentity(
    tenantId: string,
    policyId: string,
    version: string,
  ): Promise<PolicyVersion | null> {
    return database.transaction(async (transaction) => {
      await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
      const [policy] = await transaction
        .select({
          createdAt: policyVersions.createdAt,
          createdByUserId: policyVersions.createdByUserId,
          documentDigest: policyVersions.documentDigest,
          id: policyVersions.id,
          policyId: policyVersions.policyId,
          publishedAt: policyVersions.publishedAt,
          sourceFileName: policyVersions.sourceFileName,
          sourceMediaType: policyVersions.sourceMediaType,
          sourceSizeBytes: policyVersions.sourceSizeBytes,
          title: policyVersions.title,
          version: policyVersions.version,
        })
        .from(policyVersions)
        .where(
          and(
            eq(policyVersions.tenantId, tenantId),
            eq(policyVersions.policyId, policyId),
            eq(policyVersions.version, version),
          ),
        )
        .limit(1);
      if (!policy) return null;
      const controls = await transaction
        .select({
          attestationCriterion: policyControls.attestationCriterion,
          controlId: policyControls.controlId,
          controlVersion: policyControls.controlVersion,
          evidenceRequirement: policyControls.evidenceRequirement,
          interpretation: policyControls.interpretation,
          title: policyControls.title,
        })
        .from(policyControls)
        .where(eq(policyControls.policyVersionId, policy.id));
      return policyVersionSchema.parse({
        ...policy,
        controls,
        createdAt: policy.createdAt.toISOString(),
        publishedAt: policy.publishedAt.toISOString(),
        source: toPolicySource(policy),
      });
    });
  }

  return {
    async findControlRecord(tenantId, policyVersionId, controlId) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const [record] = await transaction
          .select({
            attestationCriterion: policyControls.attestationCriterion,
            controlId: policyControls.controlId,
            controlRecordId: policyControls.id,
            controlVersion: policyControls.controlVersion,
            documentDigest: policyVersions.documentDigest,
            evidenceRequirement: policyControls.evidenceRequirement,
            interpretation: policyControls.interpretation,
            policyId: policyVersions.policyId,
            policyVersion: policyVersions.version,
          })
          .from(policyControls)
          .innerJoin(policyVersions, eq(policyControls.policyVersionId, policyVersions.id))
          .where(
            and(
              eq(policyControls.tenantId, tenantId),
              eq(policyControls.policyVersionId, policyVersionId),
              eq(policyControls.controlId, controlId),
            ),
          )
          .limit(1);
        if (!record) return null;
        return {
          binding: policyContractBindingSchema.parse({
            control: {
              attestationCriterion: record.attestationCriterion,
              controlId: record.controlId,
              controlVersion: record.controlVersion,
              evidenceRequirement: record.evidenceRequirement,
              interpretation: record.interpretation,
              policyDocumentDigest: record.documentDigest,
            },
            policyId: record.policyId,
            policyVersion: record.policyVersion,
          }),
          controlRecordId: record.controlRecordId,
        };
      });
    },
    async create(tenantId, actorId, input) {
      try {
        return await database.transaction(async (transaction) => {
          await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
          const [created] = await transaction
            .insert(policyVersions)
            .values({
              createdByUserId: actorId,
              documentDigest: input.documentDigest,
              policyId: input.policyId,
              sourceFileName: input.source.fileName,
              sourceMediaType: input.source.mediaType,
              sourceObjectName: `tenants/${tenantId}/policy-sources/${input.documentDigest.slice("sha256:".length)}`,
              sourceSizeBytes: input.source.sizeBytes,
              tenantId,
              title: input.title,
              version: input.version,
            })
            .returning({
              createdAt: policyVersions.createdAt,
              createdByUserId: policyVersions.createdByUserId,
              documentDigest: policyVersions.documentDigest,
              id: policyVersions.id,
              policyId: policyVersions.policyId,
              publishedAt: policyVersions.publishedAt,
              sourceFileName: policyVersions.sourceFileName,
              sourceMediaType: policyVersions.sourceMediaType,
              sourceSizeBytes: policyVersions.sourceSizeBytes,
              title: policyVersions.title,
              version: policyVersions.version,
            });
          if (!created) throw new Error("Policy version could not be created.");
          const controls = await transaction
            .insert(policyControls)
            .values(
              input.controls.map((control) => ({
                ...control,
                policyVersionId: created.id,
                tenantId,
              })),
            )
            .returning({
              attestationCriterion: policyControls.attestationCriterion,
              controlId: policyControls.controlId,
              controlVersion: policyControls.controlVersion,
              evidenceRequirement: policyControls.evidenceRequirement,
              interpretation: policyControls.interpretation,
              title: policyControls.title,
            });
          return {
            ...created,
            controls: controls.map((control) => policyLibraryControlSchema.parse(control)),
            createdAt: created.createdAt.toISOString(),
            publishedAt: created.publishedAt.toISOString(),
            source: input.source,
          } satisfies PolicyVersion;
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const existing = await findByIdentity(tenantId, input.policyId, input.version);
        if (existing && samePublishedPolicy(existing, input)) return existing;
        throw new PolicyVersionConflictError();
      }
    },
    async findControl(tenantId, policyId, version, controlId) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const [policy] = await transaction
          .select({
            createdAt: policyVersions.createdAt,
            createdByUserId: policyVersions.createdByUserId,
            documentDigest: policyVersions.documentDigest,
            id: policyVersions.id,
            policyId: policyVersions.policyId,
            publishedAt: policyVersions.publishedAt,
            sourceFileName: policyVersions.sourceFileName,
            sourceMediaType: policyVersions.sourceMediaType,
            sourceSizeBytes: policyVersions.sourceSizeBytes,
            title: policyVersions.title,
            version: policyVersions.version,
          })
          .from(policyVersions)
          .innerJoin(policyControls, eq(policyControls.policyVersionId, policyVersions.id))
          .where(
            and(
              eq(policyVersions.tenantId, tenantId),
              eq(policyVersions.policyId, policyId),
              eq(policyVersions.version, version),
              eq(policyControls.controlId, controlId),
            ),
          )
          .limit(1);
        if (!policy) return null;
        const controls = await transaction
          .select({
            attestationCriterion: policyControls.attestationCriterion,
            controlId: policyControls.controlId,
            controlVersion: policyControls.controlVersion,
            evidenceRequirement: policyControls.evidenceRequirement,
            interpretation: policyControls.interpretation,
            title: policyControls.title,
          })
          .from(policyControls)
          .where(eq(policyControls.policyVersionId, policy.id));
        return {
          ...policy,
          controls: controls.map((control) => policyLibraryControlSchema.parse(control)),
          createdAt: policy.createdAt.toISOString(),
          publishedAt: policy.publishedAt.toISOString(),
          source: toPolicySource(policy),
        } satisfies PolicyVersion;
      });
    },
    async list(tenantId) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const policies = await transaction
          .select({
            createdAt: policyVersions.createdAt,
            createdByUserId: policyVersions.createdByUserId,
            documentDigest: policyVersions.documentDigest,
            id: policyVersions.id,
            policyId: policyVersions.policyId,
            publishedAt: policyVersions.publishedAt,
            sourceFileName: policyVersions.sourceFileName,
            sourceMediaType: policyVersions.sourceMediaType,
            sourceSizeBytes: policyVersions.sourceSizeBytes,
            title: policyVersions.title,
            version: policyVersions.version,
          })
          .from(policyVersions)
          .where(eq(policyVersions.tenantId, tenantId))
          .orderBy(desc(policyVersions.publishedAt));
        const controls = await transaction
          .select({
            attestationCriterion: policyControls.attestationCriterion,
            controlId: policyControls.controlId,
            controlVersion: policyControls.controlVersion,
            evidenceRequirement: policyControls.evidenceRequirement,
            interpretation: policyControls.interpretation,
            policyVersionId: policyControls.policyVersionId,
            title: policyControls.title,
          })
          .from(policyControls)
          .where(eq(policyControls.tenantId, tenantId));
        return policies.map((policy) => ({
          ...policy,
          controls: controls
            .filter((control) => control.policyVersionId === policy.id)
            .map(({ policyVersionId: _policyVersionId, ...control }) =>
              policyLibraryControlSchema.parse(control),
            ),
          createdAt: policy.createdAt.toISOString(),
          publishedAt: policy.publishedAt.toISOString(),
          source: toPolicySource(policy),
        })) satisfies PolicyVersion[];
      });
    },
  };
}

export function createPostgresPolicyContractDeploymentStore(
  database: Database,
): PolicyContractDeploymentStore {
  async function updateOne(
    tenantId: string,
    deploymentId: string,
    allowedStatuses: PolicyContractDeployment["status"][],
    values: Partial<typeof policyContractDeployments.$inferInsert>,
  ): Promise<PolicyContractDeployment> {
    return database.transaction(async (transaction) => {
      await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
      const [updated] = await transaction
        .update(policyContractDeployments)
        .set({ ...values, updatedAt: new Date() })
        .where(
          and(
            eq(policyContractDeployments.tenantId, tenantId),
            eq(policyContractDeployments.id, deploymentId),
            inArray(policyContractDeployments.status, allowedStatuses),
          ),
        )
        .returning();
      if (!updated) {
        throw new Error("The policy contract deployment transition was not permitted.");
      }
      return mapPolicyContractDeployment(updated);
    });
  }

  return {
    async findByPolicyControl(tenantId, policyControlRecordId) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const [deployment] = await transaction
          .select()
          .from(policyContractDeployments)
          .where(
            and(
              eq(policyContractDeployments.tenantId, tenantId),
              eq(policyContractDeployments.policyControlRecordId, policyControlRecordId),
            ),
          )
          .orderBy(desc(policyContractDeployments.updatedAt))
          .limit(1);
        return deployment ? mapPolicyContractDeployment(deployment) : null;
      });
    },
    async reserve(input) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${input.tenantId}, true)`);
        const [created] = await transaction
          .insert(policyContractDeployments)
          .values(input)
          .onConflictDoNothing({
            target: [
              policyContractDeployments.tenantId,
              policyContractDeployments.bindingDigest,
              policyContractDeployments.networkChainId,
              policyContractDeployments.sourceDigest,
            ],
          })
          .returning();
        if (created) return mapPolicyContractDeployment(created);

        const [existing] = await transaction
          .select()
          .from(policyContractDeployments)
          .where(
            and(
              eq(policyContractDeployments.tenantId, input.tenantId),
              eq(policyContractDeployments.bindingDigest, input.bindingDigest),
              eq(policyContractDeployments.networkChainId, input.networkChainId),
              eq(policyContractDeployments.sourceDigest, input.sourceDigest),
            ),
          )
          .limit(1);
        if (!existing) throw new Error("The policy contract deployment could not be reserved.");
        return mapPolicyContractDeployment(existing);
      });
    },
    async find(tenantId, deploymentId) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const [deployment] = await transaction
          .select()
          .from(policyContractDeployments)
          .where(
            and(
              eq(policyContractDeployments.tenantId, tenantId),
              eq(policyContractDeployments.id, deploymentId),
            ),
          )
          .limit(1);
        return deployment ? mapPolicyContractDeployment(deployment) : null;
      });
    },
    markSubmitting(tenantId, deploymentId) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const [updated] = await transaction
          .update(policyContractDeployments)
          .set({ status: "submitting", updatedAt: new Date() })
          .where(
            and(
              eq(policyContractDeployments.tenantId, tenantId),
              eq(policyContractDeployments.id, deploymentId),
              eq(policyContractDeployments.status, "pending"),
            ),
          )
          .returning();
        return updated ? mapPolicyContractDeployment(updated) : null;
      });
    },
    markSubmitted(tenantId, deploymentId, transactionHash) {
      return updateOne(tenantId, deploymentId, ["submitting"], {
        deploymentTransactionHash: transactionHash,
        failureCode: null,
        status: "submitted",
      });
    },
    markFinalized(tenantId, deploymentId, contractAddress) {
      return updateOne(tenantId, deploymentId, ["submitted"], {
        contractAddress,
        failureCode: null,
        finalizedAt: new Date(),
        status: "finalized",
      });
    },
    markVerified(tenantId, deploymentId) {
      return updateOne(tenantId, deploymentId, ["finalized"], {
        failureCode: null,
        status: "verified",
        verifiedAt: new Date(),
      });
    },
    async activate(tenantId, deploymentId) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const [candidate] = await transaction
          .select({ policyControlRecordId: policyContractDeployments.policyControlRecordId })
          .from(policyContractDeployments)
          .where(
            and(
              eq(policyContractDeployments.tenantId, tenantId),
              eq(policyContractDeployments.id, deploymentId),
              eq(policyContractDeployments.status, "verified"),
            ),
          )
          .limit(1);
        if (!candidate) {
          throw new Error("The policy contract deployment is not ready for activation.");
        }
        await transaction
          .update(policyContractDeployments)
          .set({ status: "superseded", updatedAt: new Date() })
          .where(
            and(
              eq(policyContractDeployments.tenantId, tenantId),
              eq(policyContractDeployments.policyControlRecordId, candidate.policyControlRecordId),
              eq(policyContractDeployments.status, "active"),
              not(eq(policyContractDeployments.id, deploymentId)),
            ),
          );
        const now = new Date();
        const [activated] = await transaction
          .update(policyContractDeployments)
          .set({ activatedAt: now, status: "active", updatedAt: now })
          .where(
            and(
              eq(policyContractDeployments.tenantId, tenantId),
              eq(policyContractDeployments.id, deploymentId),
              eq(policyContractDeployments.status, "verified"),
            ),
          )
          .returning();
        if (!activated) throw new Error("The policy contract deployment could not be activated.");
        return mapPolicyContractDeployment(activated);
      });
    },
    markFailed(tenantId, deploymentId, status, failureCode) {
      return updateOne(
        tenantId,
        deploymentId,
        ["pending", "submitting", "submitted", "finalized", "verified"],
        { failureCode, status },
      );
    },
  };
}

export function createPostgresManagedAttestationSubmissionStore(
  database: Database,
): ManagedAttestationSubmissionStore {
  async function updateOne(
    tenantId: string,
    submissionId: string,
    allowedStatuses: ManagedAttestationSubmission["status"][],
    values: Partial<typeof managedAttestationSubmissions.$inferInsert>,
  ): Promise<ManagedAttestationSubmission> {
    return database.transaction(async (transaction) => {
      await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
      const [updated] = await transaction
        .update(managedAttestationSubmissions)
        .set({ ...values, updatedAt: new Date() })
        .where(
          and(
            eq(managedAttestationSubmissions.tenantId, tenantId),
            eq(managedAttestationSubmissions.id, submissionId),
            inArray(managedAttestationSubmissions.status, allowedStatuses),
          ),
        )
        .returning();
      if (!updated) {
        throw new Error("The managed attestation submission transition was not permitted.");
      }
      return mapManagedAttestationSubmission(updated);
    });
  }

  return {
    async reserve(input) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${input.tenantId}, true)`);
        const [created] = await transaction
          .insert(managedAttestationSubmissions)
          .values(input)
          .onConflictDoNothing({
            target: [
              managedAttestationSubmissions.tenantId,
              managedAttestationSubmissions.idempotencyKey,
            ],
          })
          .returning();
        if (created) return mapManagedAttestationSubmission(created);
        const [existing] = await transaction
          .select()
          .from(managedAttestationSubmissions)
          .where(
            and(
              eq(managedAttestationSubmissions.tenantId, input.tenantId),
              eq(managedAttestationSubmissions.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1);
        if (!existing) throw new Error("The managed attestation submission was not reserved.");
        return mapManagedAttestationSubmission(existing);
      });
    },
    async find(tenantId, submissionId) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const [submission] = await transaction
          .select()
          .from(managedAttestationSubmissions)
          .where(
            and(
              eq(managedAttestationSubmissions.tenantId, tenantId),
              eq(managedAttestationSubmissions.id, submissionId),
            ),
          )
          .limit(1);
        return submission ? mapManagedAttestationSubmission(submission) : null;
      });
    },
    async findByCase(tenantId, caseId) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const [submission] = await transaction
          .select()
          .from(managedAttestationSubmissions)
          .where(
            and(
              eq(managedAttestationSubmissions.tenantId, tenantId),
              eq(managedAttestationSubmissions.caseId, caseId),
            ),
          )
          .orderBy(desc(managedAttestationSubmissions.createdAt))
          .limit(1);
        return submission ? mapManagedAttestationSubmission(submission) : null;
      });
    },
    markSubmitting(tenantId, submissionId) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const [updated] = await transaction
          .update(managedAttestationSubmissions)
          .set({ status: "submitting", updatedAt: new Date() })
          .where(
            and(
              eq(managedAttestationSubmissions.tenantId, tenantId),
              eq(managedAttestationSubmissions.id, submissionId),
              eq(managedAttestationSubmissions.status, "pending"),
            ),
          )
          .returning();
        return updated ? mapManagedAttestationSubmission(updated) : null;
      });
    },
    markSubmitted(tenantId, submissionId, transactionHash) {
      return updateOne(tenantId, submissionId, ["submitting"], {
        failureCode: null,
        status: "submitted",
        transactionHash,
      });
    },
    markFinalized(tenantId, submissionId, result) {
      return updateOne(tenantId, submissionId, ["submitted"], {
        evaluationReason: result.evaluationReason,
        failureCode: null,
        finalizedAt: new Date(),
        status: "finalized",
        verdict: result.verdict,
      });
    },
    markFailed(tenantId, submissionId, status, failureCode) {
      return updateOne(tenantId, submissionId, ["pending", "submitting", "submitted"], {
        failureCode,
        status,
      });
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
            policyId: record.policyId,
            policyVersion: record.policyVersion,
            recommendation: record.recommendation,
            riskLevel: record.riskLevel,
            reviewDueAt: new Date(record.reviewDueAt),
            ruleId: record.ruleId,
            tenantId: record.tenantId,
            updatedAt: record.occurredAt,
            status: "draft",
          })
          .onConflictDoNothing({
            target: [reviewCases.tenantId, reviewCases.externalReference],
          })
          .returning({
            createdAt: reviewCases.createdAt,
            externalReference: reviewCases.externalReference,
            fingerprint: reviewCases.intakeFingerprint,
            hollisCaseReference: reviewCases.hollisCaseReference,
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
              policyId: record.policyId,
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
            hollisCaseReference: reviewCases.hollisCaseReference,
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
            hollisCaseReference: detail.hollisCaseReference,
            id: detail.id,
            policyId: detail.policyId,
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
            hollisCaseReference: reviewCases.hollisCaseReference,
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

        const [evidenceCount] = await transaction.execute(sql<{ count: number }>`
          select count(*)::integer as count
          from evidence_attachments ea
          inner join evidence_objects eo on eo.id = ea.evidence_object_id
          where ea.tenant_id = ${tenantId}::uuid and ea.case_id = ${caseId}::uuid
            and ea.state = 'active' and eo.verified = true
        `);
        if (Number(evidenceCount?.count ?? 0) < 1) throw new ReviewCaseTransitionError();

        const occurredAt = new Date();
        const [updated] = await transaction
          .update(reviewCases)
          .set({
            assignedAt: occurredAt,
            assignedToUserId: actorId,
            evidenceFrozenAt: occurredAt,
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
        await transaction.execute(sql`
          select id
          from review_cases
          where tenant_id = ${tenantId}::uuid and id = ${caseId}::uuid
          for update
        `);
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
        const managedEvidence = await transaction
          .select({ verified: evidenceObjects.verified })
          .from(evidenceAttachments)
          .innerJoin(evidenceObjects, eq(evidenceAttachments.evidenceObjectId, evidenceObjects.id))
          .where(
            and(
              eq(evidenceAttachments.tenantId, tenantId),
              eq(evidenceAttachments.caseId, caseId),
              eq(evidenceAttachments.state, "active"),
            ),
          );
        if (managedEvidence.length === 0 || managedEvidence.some((item) => !item.verified)) {
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
    async create(tenantId, caseId, input: EvidenceUpload & { expiresAt: Date; id: string; objectName: string }) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        await transaction.execute(sql`
          select id
          from review_cases
          where tenant_id = ${tenantId}::uuid and id = ${caseId}::uuid
          for update
        `);
        const reviewCase = await selectCase(transaction, tenantId, caseId);
        if (!reviewCase) throw new Error("Review case was not found.");
        if (reviewCase.status !== "draft" && (reviewCase.status !== "pending" || reviewCase.evidenceFrozenAt)) {
          throw new ReviewCaseTransitionError();
        }
        const [created] = await transaction
          .insert(evidenceUploads)
          .values({
            caseId,
            digest: input.digest,
            expiresAt: input.expiresAt,
            id: input.id,
            mediaType: input.mediaType,
            quarantineObjectName: input.objectName,
            sizeBytes: input.sizeBytes,
            tenantId,
          })
          .returning({ id: evidenceUploads.id });
        if (!created) throw new Error("Evidence upload could not be created.");
        return created;
      });
    },
    async markVerified(tenantId, caseId, evidenceId, object, actorId = "system:evidence-verifier") {
      await database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        await transaction.execute(sql`
          select id from review_cases
          where tenant_id = ${tenantId}::uuid and id = ${caseId}::uuid
          for update
        `);
        const reviewCase = await selectCase(transaction, tenantId, caseId);
        if (
          !reviewCase ||
          (reviewCase.status !== "draft" && (reviewCase.status !== "pending" || reviewCase.evidenceFrozenAt))
        ) {
          throw new ReviewCaseTransitionError();
        }
        const [upload] = await transaction
          .select()
          .from(evidenceUploads)
          .where(and(eq(evidenceUploads.tenantId, tenantId), eq(evidenceUploads.caseId, caseId), eq(evidenceUploads.id, evidenceId)))
          .limit(1);
        if (!upload || upload.expiresAt < new Date()) throw new Error("Evidence upload has expired.");
        if (upload.state === "verified") return;

        const [inserted] = await transaction
          .insert(evidenceObjects)
          .values({
            digest: upload.digest,
            mediaType: upload.mediaType,
            objectName: object.objectName,
            providerEtag: object.providerEtag ?? null,
            providerVersion: object.providerVersion ?? null,
            sizeBytes: upload.sizeBytes,
            tenantId,
            verified: true,
            verifiedAt: new Date(),
          })
          .onConflictDoNothing({ target: [evidenceObjects.tenantId, evidenceObjects.digest] })
          .returning({ id: evidenceObjects.id });
        const evidenceObject = inserted ?? (await transaction.select({ id: evidenceObjects.id }).from(evidenceObjects).where(and(eq(evidenceObjects.tenantId, tenantId), eq(evidenceObjects.digest, upload.digest))).limit(1))[0];
        if (!evidenceObject) throw new Error("Immutable evidence metadata could not be stored.");

        const [ordinalRow] = await transaction.execute(sql<{ ordinal: number }>`select coalesce(max(ordinal), 0) + 1 as ordinal from evidence_attachments where tenant_id = ${tenantId}::uuid and case_id = ${caseId}::uuid`);
        const [attachment] = await transaction
          .insert(evidenceAttachments)
          .values({
            attachedByUserId: actorId,
            caseId,
            evidenceObjectId: evidenceObject.id,
            ordinal: Number(ordinalRow?.ordinal ?? 1),
            tenantId,
          })
          .onConflictDoNothing({ target: [evidenceAttachments.caseId, evidenceAttachments.evidenceObjectId] })
          .returning({ id: evidenceAttachments.id });
        await transaction.update(evidenceUploads).set({ evidenceObjectId: evidenceObject.id, state: "verified", updatedAt: new Date() }).where(eq(evidenceUploads.id, evidenceId));
        if (attachment) {
          await appendEvent(transaction, {
            actorId,
            caseId,
            eventType: "evidence_added",
            occurredAt: new Date(),
            payload: { attachmentId: attachment.id, digest: upload.digest, mediaType: upload.mediaType, sizeBytes: upload.sizeBytes },
            tenantId,
          });
          await appendEvent(transaction, {
            actorId,
            caseId,
            eventType: "evidence_verified",
            occurredAt: new Date(),
            payload: { attachmentId: attachment.id, digest: upload.digest, providerVersion: object.providerVersion ?? null, sizeBytes: upload.sizeBytes },
            tenantId,
          });
        }
        const ledger = await transaction.select({ digest: evidenceObjects.digest, id: evidenceAttachments.id, mediaType: evidenceObjects.mediaType }).from(evidenceAttachments).innerJoin(evidenceObjects, eq(evidenceAttachments.evidenceObjectId, evidenceObjects.id)).where(and(eq(evidenceAttachments.tenantId, tenantId), eq(evidenceAttachments.caseId, caseId), eq(evidenceAttachments.state, "active"))).orderBy(asc(evidenceAttachments.ordinal));
        await transaction
          .update(reviewCases)
          .set({
            evidence: ledger,
            status: reviewCase.status === "draft" ? "pending" : reviewCase.status,
            updatedAt: new Date(),
          })
          .where(and(eq(reviewCases.tenantId, tenantId), eq(reviewCases.id, caseId)));
      });
    },
    async markFailed(tenantId, caseId, evidenceId, actorId = "system:evidence-verifier") {
      await database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const [upload] = await transaction
          .update(evidenceUploads)
          .set({ failureCode: "verification_failed", state: "failed", updatedAt: new Date() })
          .where(
            and(
              eq(evidenceUploads.tenantId, tenantId),
              eq(evidenceUploads.caseId, caseId),
              eq(evidenceUploads.id, evidenceId),
              not(eq(evidenceUploads.state, "verified")),
            ),
          )
          .returning({ digest: evidenceUploads.digest, id: evidenceUploads.id, sizeBytes: evidenceUploads.sizeBytes });
        if (!upload) return;
        await appendEvent(transaction, {
          actorId,
          caseId,
          eventType: "evidence_upload_failed",
          occurredAt: new Date(),
          payload: { digest: upload.digest, evidenceId: upload.id, failureCode: "verification_failed", sizeBytes: upload.sizeBytes },
          tenantId,
        });
      });
    },
    async get(tenantId, caseId, evidenceId) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const [upload] = await transaction
          .select({
            digest: sql<string>`coalesce(${evidenceObjects.digest}, ${evidenceUploads.digest})`,
            id: evidenceUploads.id,
            mediaType: sql<string>`coalesce(${evidenceObjects.mediaType}, ${evidenceUploads.mediaType})`,
            objectName: sql<string>`coalesce(${evidenceObjects.objectName}, ${evidenceUploads.quarantineObjectName})`,
            providerEtag: evidenceObjects.providerEtag,
            providerVersion: evidenceObjects.providerVersion,
            sizeBytes: sql<number>`coalesce(${evidenceObjects.sizeBytes}, ${evidenceUploads.sizeBytes})`,
            verified: sql<boolean>`coalesce(${evidenceObjects.verified}, false)`,
          })
          .from(evidenceUploads)
          .leftJoin(evidenceObjects, eq(evidenceUploads.evidenceObjectId, evidenceObjects.id))
          .where(
            and(
              eq(evidenceUploads.tenantId, tenantId),
              eq(evidenceUploads.caseId, caseId),
              eq(evidenceUploads.id, evidenceId),
            ),
          )
          .limit(1);
        if (upload) return upload;
        const [attachment] = await transaction
          .select({
            digest: evidenceObjects.digest,
            id: evidenceAttachments.id,
            mediaType: evidenceObjects.mediaType,
            objectName: evidenceObjects.objectName,
            providerEtag: evidenceObjects.providerEtag,
            providerVersion: evidenceObjects.providerVersion,
            sizeBytes: evidenceObjects.sizeBytes,
            verified: evidenceObjects.verified,
          })
          .from(evidenceAttachments)
          .innerJoin(evidenceObjects, eq(evidenceAttachments.evidenceObjectId, evidenceObjects.id))
          .where(and(eq(evidenceAttachments.tenantId, tenantId), eq(evidenceAttachments.caseId, caseId), eq(evidenceAttachments.id, evidenceId)))
          .limit(1);
        if (attachment) return attachment;
        const [legacy] = await transaction.select({ digest: evidenceObjects.digest, id: evidenceObjects.id, mediaType: evidenceObjects.mediaType, objectName: evidenceObjects.objectName, providerEtag: evidenceObjects.providerEtag, providerVersion: evidenceObjects.providerVersion, sizeBytes: evidenceObjects.sizeBytes, verified: evidenceObjects.verified }).from(evidenceObjects).where(and(eq(evidenceObjects.tenantId, tenantId), eq(evidenceObjects.caseId, caseId), eq(evidenceObjects.id, evidenceId))).limit(1);
        return legacy ?? null;
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
          .from(evidenceAttachments)
          .innerJoin(evidenceObjects, eq(evidenceAttachments.evidenceObjectId, evidenceObjects.id))
          .where(and(eq(evidenceAttachments.tenantId, tenantId), eq(evidenceAttachments.caseId, caseId), eq(evidenceAttachments.state, "active")))
          .orderBy(asc(evidenceAttachments.ordinal));
      });
    },
    async remove(tenantId, caseId, evidenceId, actorId) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const reviewCase = await selectCase(transaction, tenantId, caseId);
        if (!reviewCase || reviewCase.evidenceFrozenAt || !["draft", "pending"].includes(reviewCase.status)) {
          throw new ReviewCaseTransitionError();
        }
        const [attachment] = await transaction
          .update(evidenceAttachments)
          .set({ removedAt: new Date(), removedByUserId: actorId, state: "removed" })
          .where(and(eq(evidenceAttachments.tenantId, tenantId), eq(evidenceAttachments.caseId, caseId), eq(evidenceAttachments.id, evidenceId), eq(evidenceAttachments.state, "active")))
          .returning({ evidenceObjectId: evidenceAttachments.evidenceObjectId, id: evidenceAttachments.id });
        if (!attachment) return false;
        await appendEvent(transaction, {
          actorId,
          caseId,
          eventType: "evidence_removed",
          occurredAt: new Date(),
          payload: { attachmentId: attachment.id, evidenceObjectId: attachment.evidenceObjectId },
          tenantId,
        });
        const ledger = await transaction.select({ digest: evidenceObjects.digest, id: evidenceAttachments.id, mediaType: evidenceObjects.mediaType }).from(evidenceAttachments).innerJoin(evidenceObjects, eq(evidenceAttachments.evidenceObjectId, evidenceObjects.id)).where(and(eq(evidenceAttachments.tenantId, tenantId), eq(evidenceAttachments.caseId, caseId), eq(evidenceAttachments.state, "active"))).orderBy(asc(evidenceAttachments.ordinal));
        await transaction.update(reviewCases).set({ evidence: ledger, updatedAt: new Date() }).where(and(eq(reviewCases.tenantId, tenantId), eq(reviewCases.id, caseId)));
        return true;
      });
    },
    async listExpired(tenantId, limit) {
      return database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        return transaction
          .select({ caseId: evidenceUploads.caseId, evidenceId: evidenceUploads.id, objectName: evidenceUploads.quarantineObjectName })
          .from(evidenceUploads)
          .where(
            and(
              eq(evidenceUploads.tenantId, tenantId),
              inArray(evidenceUploads.state, ["quarantined", "failed"]),
              sql`${evidenceUploads.expiresAt} <= now()`,
            ),
          )
          .orderBy(asc(evidenceUploads.expiresAt))
          .limit(limit);
      });
    },
    async markQuarantineCleaned(tenantId, caseId, evidenceId) {
      await database.transaction(async (transaction) => {
        await transaction.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        const [cleaned] = await transaction
          .update(evidenceUploads)
          .set({ state: "cleaned", updatedAt: new Date() })
          .where(
            and(
              eq(evidenceUploads.tenantId, tenantId),
              eq(evidenceUploads.caseId, caseId),
              eq(evidenceUploads.id, evidenceId),
              inArray(evidenceUploads.state, ["quarantined", "failed"]),
            ),
          )
          .returning({ digest: evidenceUploads.digest, id: evidenceUploads.id });
        if (!cleaned) return;
        await appendEvent(transaction, {
          actorId: "system:evidence-cleanup",
          caseId,
          eventType: "evidence_quarantine_cleaned",
          occurredAt: new Date(),
          payload: { digest: cleaned.digest, evidenceId: cleaned.id },
          tenantId,
        });
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
      .from(evidenceAttachments)
      .innerJoin(evidenceObjects, eq(evidenceAttachments.evidenceObjectId, evidenceObjects.id))
      .innerJoin(reviewCases, eq(reviewCases.id, evidenceAttachments.caseId))
      .where(
        and(
          eq(evidenceObjects.tenantId, tenantId),
          eq(evidenceAttachments.caseId, caseId),
          eq(evidenceAttachments.id, evidenceId),
          eq(evidenceAttachments.state, "active"),
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
      .where(sql`${evidenceObjects.id} = (
        select ea.evidence_object_id
        from evidence_attachments ea
        where ea.tenant_id = ${tenantId}::uuid
          and ea.case_id = ${caseId}::uuid
          and ea.id = ${evidenceId}::uuid
          and ea.state = 'active'
      )`)
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
