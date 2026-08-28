import {
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    externalReference: text("external_reference").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    policyVersion: text("policy_version").notNull(),
    recommendation: text("recommendation").notNull(),
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
    index("review_cases_tenant_status_idx").on(table.tenantId, table.status),
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
