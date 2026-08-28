import { reviewCases, reviewEvents, tenants } from "@hollis/database";
import { and, eq, sql } from "drizzle-orm";
import type { createDatabase } from "@hollis/database";
import type { ReviewIntakeRecord, ReviewIntakeStore, TenantResolver } from "./review-intake.js";

type Database = ReturnType<typeof createDatabase>["database"];

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
            id: record.caseId,
            intakeFingerprint: record.fingerprint,
            policyVersion: record.policyVersion,
            recommendation: record.recommendation,
            riskLevel: record.riskLevel,
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
