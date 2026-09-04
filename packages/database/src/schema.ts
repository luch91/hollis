import {
  bigserial,
  boolean,
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

export const tenants = pgTable("tenants", {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  workosOrganizationId: text("workos_organization_id").notNull().unique(),
});

export const users = pgTable("users", {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  id: uuid("id").primaryKey().defaultRandom(),
  workosUserId: text("workos_user_id").notNull().unique(),
});

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
    workosMembershipId: text("workos_membership_id").notNull().unique(),
  },
  (table) => [
    uniqueIndex("tenant_memberships_tenant_user_unique").on(table.tenantId, table.userId),
    index("tenant_memberships_user_idx").on(table.userId),
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
    id: uuid("id").primaryKey().defaultRandom(),
    intakeFingerprint: text("intake_fingerprint").notNull(),
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
