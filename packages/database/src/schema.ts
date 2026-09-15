import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  foreignKey,
  integer,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const reviewStatus = pgEnum("review_status", [
  "pending",
  "in_review",
  "completed",
  "escalated",
]);

export const eventType = pgEnum("review_event_type", [
  "case_created",
  "review_started",
  "evidence_added",
  "decision_recorded",
  "case_escalated",
  "attestation_recorded",
  "attestation_updated",
  "attestation_case_file_published",
  "retention_deletion_requested",
  "evidence_deleted",
  "legal_hold_changed",
]);

export const retentionDeletionStatus = pgEnum("retention_deletion_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const attestationStatus = pgEnum("attestation_status", [
  "submitted",
  "accepted",
  "appealed",
  "finalized",
  "failed",
  "undetermined",
]);

export const policyPublicationStatus = pgEnum("policy_publication_status", ["published"]);

export const notificationDeliveryStatus = pgEnum("notification_delivery_status", [
  "pending",
  "sending",
  "sent",
  "failed",
]);

export const tenants = pgTable("tenants", {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  id: uuid("id").primaryKey().defaultRandom(),
  industry: text("industry"),
  logoDigest: text("logo_digest"),
  logoMediaType: text("logo_media_type"),
  logoObjectName: text("logo_object_name"),
  logoSourceHost: text("logo_source_host"),
  logoUpdatedAt: timestamp("logo_updated_at", { withTimezone: true }),
  logoUpdatedByUserId: uuid("logo_updated_by_user_id").references(() => users.id),
  name: text("name").notNull(),
  operatingRegion: text("operating_region"),
  legacyWorkosOrganizationId: text("workos_organization_id").unique(),
  website: text("website"),
});

export const users = pgTable("users", {
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  displayName: text("display_name"),
  email: text("email"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  id: uuid("id").primaryKey().defaultRandom(),
  jobTitle: text("job_title"),
  legacyWorkosUserId: text("workos_user_id").unique(),
  profileAvatarDigest: text("profile_avatar_digest"),
  profileAvatarMediaType: text("profile_avatar_media_type"),
  profileAvatarObjectName: text("profile_avatar_object_name"),
  profileAvatarTenantId: uuid("profile_avatar_tenant_id"),
  profileAvatarUpdatedAt: timestamp("profile_avatar_updated_at", { withTimezone: true }),
  timeZone: text("time_zone"),
});

export const identityAccounts = pgTable(
  "identity_accounts",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    email: text("email").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    providerSubject: text("provider_subject").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    uniqueIndex("identity_accounts_provider_subject_unique").on(
      table.provider,
      table.providerSubject,
    ),
    index("identity_accounts_user_idx").on(table.userId),
  ],
);

export const tenantMemberships = pgTable(
  "tenant_memberships",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    id: uuid("id").primaryKey().defaultRandom(),
    role: text("role").notNull(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    legacyWorkosMembershipId: text("workos_membership_id").unique(),
  },
  (table) => [
    uniqueIndex("tenant_memberships_tenant_user_unique").on(table.tenantId, table.userId),
    index("tenant_memberships_user_idx").on(table.userId),
  ],
);

export const applicationSessions = pgTable(
  "application_sessions",
  {
    activeTenantId: uuid("active_tenant_id").references(() => tenants.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    tokenDigest: text("token_digest").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    index("application_sessions_user_idx").on(table.userId),
    index("application_sessions_active_tenant_idx").on(table.activeTenantId),
  ],
);

export const accountNotificationDeliveries = pgTable(
  "account_notification_deliveries",
  {
    attemptedAt: timestamp("attempted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    id: uuid("id").primaryKey().defaultRandom(),
    notificationType: text("notification_type").notNull(),
    providerMessageId: text("provider_message_id"),
    status: notificationDeliveryStatus("status").notNull().default("pending"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    uniqueIndex("account_notification_deliveries_user_type_unique").on(
      table.userId,
      table.notificationType,
    ),
    index("account_notification_deliveries_status_idx").on(table.status, table.createdAt),
  ],
);

export const workspaceInvitations = pgTable(
  "workspace_invitations",
  {
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    email: text("email").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    invitedByUserId: uuid("invited_by_user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    tokenDigest: text("token_digest").notNull().unique(),
  },
  (table) => [
    index("workspace_invitations_tenant_email_idx").on(table.tenantId, table.email),
    index("workspace_invitations_expiry_idx").on(table.expiresAt),
  ],
);

export const workspaceAuditEvents = pgTable(
  "workspace_audit_events",
  {
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    eventHash: text("event_hash").notNull(),
    eventSequence: bigserial("event_sequence", { mode: "number" }).notNull().unique(),
    eventType: text("event_type").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    payload: jsonb("payload").notNull(),
    previousHash: text("previous_hash"),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
  },
  (table) => [
    index("workspace_audit_events_tenant_created_idx").on(table.tenantId, table.createdAt),
    uniqueIndex("workspace_audit_events_event_hash_unique").on(table.eventHash),
  ],
);

export const reviewCases = pgTable(
  "review_cases",
  {
    automatedSystemVersion: text("automated_system_version").notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    assignedToUserId: text("assigned_to_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decisionOutcome: text("decision_outcome"),
    decisionRationale: text("decision_rationale"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedByUserId: text("decided_by_user_id"),
    evidence: jsonb("evidence").notNull(),
    externalReference: text("external_reference").notNull(),
    escalationReason: text("escalation_reason"),
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    escalatedByUserId: text("escalated_by_user_id"),
    finalRecommendation: text("final_recommendation"),
    hollisCaseReference: text("hollis_case_reference")
      .notNull()
      .default(sql`public.generate_hollis_case_reference(now())`),
    id: uuid("id").primaryKey().defaultRandom(),
    intakeFingerprint: text("intake_fingerprint").notNull(),
    policyId: text("policy_id"),
    policyVersion: text("policy_version").notNull(),
    recommendation: text("recommendation").notNull(),
    reviewDueAt: timestamp("review_due_at", { withTimezone: true }),
    riskLevel: text("risk_level").notNull(),
    ruleId: text("rule_id").notNull(),
    status: reviewStatus("status").notNull().default("pending"),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("review_cases_id_tenant_unique").on(table.id, table.tenantId),
    uniqueIndex("review_cases_hollis_case_reference_unique").on(table.hollisCaseReference),
    uniqueIndex("review_cases_tenant_external_reference_unique").on(
      table.tenantId,
      table.externalReference,
    ),
    index("review_cases_tenant_queue_idx").on(
      table.tenantId,
      table.status,
      table.reviewDueAt,
      table.createdAt,
    ),
  ],
);

export const evidenceObjects = pgTable(
  "evidence_objects",
  {
    caseId: uuid("case_id")
      .notNull()
      .references(() => reviewCases.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    digest: text("digest").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    legalHold: text("legal_hold").notNull().default("none"),
    mediaType: text("media_type").notNull(),
    objectName: text("object_name").notNull(),
    retentionUntil: timestamp("retention_until", { withTimezone: true }),
    sizeBytes: integer("size_bytes").notNull(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    verified: boolean("verified").notNull().default(false),
  },
  (table) => [
    uniqueIndex("evidence_objects_tenant_digest_unique").on(table.tenantId, table.digest),
    index("evidence_objects_case_idx").on(table.caseId),
  ],
);

export const reviewEvents = pgTable(
  "review_events",
  {
    actorId: text("actor_id").notNull(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => reviewCases.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    eventHash: text("event_hash").notNull(),
    eventSequence: bigserial("event_sequence", { mode: "number" }).notNull().unique(),
    eventType: eventType("event_type").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    payload: jsonb("payload").notNull(),
    previousHash: text("previous_hash"),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
  },
  (table) => [
    uniqueIndex("review_events_event_hash_unique").on(table.eventHash),
    index("review_events_case_created_idx").on(table.caseId, table.createdAt),
    index("review_events_tenant_created_idx").on(table.tenantId, table.createdAt),
  ],
);

export const attestations = pgTable(
  "attestations",
  {
    caseCommitment: text("case_commitment").notNull(),
    caseFile: jsonb("case_file").notNull(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => reviewCases.id),
    contractAddress: text("contract_address").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    providerSubmissionId: text("provider_submission_id").notNull(),
    publicCaseFileUrl: text("public_case_file_url").notNull(),
    status: attestationStatus("status").notNull(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    transactionHash: text("transaction_hash"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    verdict: text("verdict"),
  },
  (table) => [
    uniqueIndex("attestations_provider_submission_unique").on(
      table.provider,
      table.providerSubmissionId,
    ),
    index("attestations_case_created_idx").on(table.caseId, table.createdAt),
    index("attestations_tenant_case_idx").on(table.tenantId, table.caseId),
  ],
);

export const publicAttestationCaseFiles = pgTable(
  "public_attestation_case_files",
  {
    caseCommitment: text("case_commitment").notNull(),
    caseFile: jsonb("case_file").notNull(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => reviewCases.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    publicId: uuid("public_id").primaryKey(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
  },
  (table) => [
    index("public_attestation_case_files_case_idx").on(table.caseId, table.createdAt),
    index("public_attestation_case_files_tenant_case_idx").on(table.tenantId, table.caseId),
  ],
);

export const policyVersions = pgTable(
  "policy_versions",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    documentDigest: text("document_digest").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    policyId: text("policy_id").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
    status: policyPublicationStatus("status").notNull().default("published"),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    title: text("title").notNull(),
    version: text("version").notNull(),
  },
  (table) => [
    uniqueIndex("policy_versions_tenant_policy_version_unique").on(
      table.tenantId,
      table.policyId,
      table.version,
    ),
    index("policy_versions_tenant_published_idx").on(table.tenantId, table.publishedAt),
  ],
);

export const policyControls = pgTable(
  "policy_controls",
  {
    attestationCriterion: text("attestation_criterion").notNull(),
    controlId: text("control_id").notNull(),
    controlVersion: text("control_version").notNull(),
    evidenceRequirement: text("evidence_requirement").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    interpretation: text("interpretation").notNull(),
    policyVersionId: uuid("policy_version_id")
      .notNull()
      .references(() => policyVersions.id),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    title: text("title").notNull(),
  },
  (table) => [
    uniqueIndex("policy_controls_version_control_unique").on(
      table.policyVersionId,
      table.controlId,
    ),
    uniqueIndex("policy_controls_id_tenant_unique").on(table.id, table.tenantId),
    index("policy_controls_tenant_version_idx").on(table.tenantId, table.policyVersionId),
  ],
);

export const policyContractDeployments = pgTable(
  "policy_contract_deployments",
  {
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    binding: jsonb("binding").notNull(),
    bindingDigest: text("binding_digest").notNull(),
    contractAddress: text("contract_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    deploymentTransactionHash: text("deployment_transaction_hash").unique(),
    failureCode: text("failure_code"),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    id: uuid("id").primaryKey().defaultRandom(),
    network: text("network").notNull(),
    networkChainId: integer("network_chain_id").notNull(),
    policyControlRecordId: uuid("policy_control_record_id")
      .notNull()
      .references(() => policyControls.id),
    runtimeAddress: text("runtime_address").notNull(),
    sourceDigest: text("source_digest").notNull(),
    sourceVersion: text("source_version").notNull(),
    status: text("status").notNull().default("pending"),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.policyControlRecordId, table.tenantId],
      foreignColumns: [policyControls.id, policyControls.tenantId],
      name: "policy_contract_deployments_control_tenant_fk",
    }),
    uniqueIndex("policy_contract_deployments_binding_unique").on(
      table.tenantId,
      table.bindingDigest,
      table.networkChainId,
      table.sourceDigest,
    ),
    uniqueIndex("policy_contract_deployments_id_tenant_unique").on(table.id, table.tenantId),
    index("policy_contract_deployments_control_idx").on(
      table.tenantId,
      table.policyControlRecordId,
      table.createdAt,
    ),
    index("policy_contract_deployments_status_idx").on(table.status, table.updatedAt),
  ],
);

export const managedAttestationSubmissions = pgTable(
  "managed_attestation_submissions",
  {
    caseCommitment: text("case_commitment").notNull(),
    caseId: uuid("case_id").notNull(),
    contractAddress: text("contract_address").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deploymentId: uuid("deployment_id").notNull(),
    evaluationReason: text("evaluation_reason"),
    failureCode: text("failure_code"),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: text("idempotency_key").notNull(),
    publicCaseFileUrl: text("public_case_file_url").notNull(),
    runtimeAddress: text("runtime_address").notNull(),
    status: text("status").notNull().default("pending"),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    transactionHash: text("transaction_hash").unique(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    verdict: text("verdict"),
  },
  (table) => [
    foreignKey({
      columns: [table.caseId, table.tenantId],
      foreignColumns: [reviewCases.id, reviewCases.tenantId],
      name: "managed_attestation_submissions_case_tenant_fk",
    }),
    foreignKey({
      columns: [table.deploymentId, table.tenantId],
      foreignColumns: [policyContractDeployments.id, policyContractDeployments.tenantId],
      name: "managed_attestation_submissions_deployment_tenant_fk",
    }),
    uniqueIndex("managed_attestation_submissions_idempotency_unique").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    index("managed_attestation_submissions_case_idx").on(
      table.tenantId,
      table.caseId,
      table.createdAt,
    ),
    index("managed_attestation_submissions_status_idx").on(table.status, table.updatedAt),
  ],
);

export const retentionDeletionJobs = pgTable(
  "retention_deletion_jobs",
  {
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => reviewCases.id),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidenceObjects.id),
    id: uuid("id").primaryKey().defaultRandom(),
    lastError: text("last_error"),
    objectName: text("object_name").notNull(),
    status: retentionDeletionStatus("status").notNull().default("pending"),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
  },
  (table) => [
    uniqueIndex("retention_deletion_jobs_evidence_unique").on(table.tenantId, table.evidenceId),
    index("retention_deletion_jobs_claim_idx").on(table.status, table.availableAt),
  ],
);
