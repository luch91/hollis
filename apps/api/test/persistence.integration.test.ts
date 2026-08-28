import { createDatabase, reviewCases, reviewEvents, tenants } from "@hollis/database";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPostgresReviewIntakeStore,
  createPostgresTenantResolver,
} from "../src/persistence.js";
import {
  createReviewIntake,
  type ReviewIntakeRecord,
  ReviewIntakeConflictError,
} from "../src/review-intake.js";

const ownerUrl = process.env.DATABASE_TEST_URL;
const runtimeUrl = process.env.DATABASE_URL;
if (!ownerUrl || !runtimeUrl) {
  throw new Error("DATABASE_TEST_URL and DATABASE_URL are required for persistence tests.");
}

const owner = createDatabase(ownerUrl);
const runtime = createDatabase(runtimeUrl);
const tenantId = randomUUID();
const organizationId = `org_${randomUUID()}`;
const externalReference = `claim_${randomUUID()}`;
const input = {
  automatedSystemVersion: "claims-model-2026-08",
  evidence: [
    {
      digest: `sha256:${"a".repeat(64)}`,
      id: "evidence-001",
      mediaType: "application/pdf",
    },
  ],
  externalReference,
  policyVersion: "commercial-property-2026-01",
  recommendation: "deny" as const,
  riskLevel: "high" as const,
  ruleId: "human-review-adverse-action",
};

beforeAll(async () => {
  await owner.database.insert(tenants).values({
    id: tenantId,
    name: "Persistence integration tenant",
    workosOrganizationId: organizationId,
  });
});

afterAll(async () => {
  await owner.database.delete(reviewEvents).where(eq(reviewEvents.tenantId, tenantId));
  await owner.database.delete(reviewCases).where(eq(reviewCases.tenantId, tenantId));
  await owner.database.delete(tenants).where(eq(tenants.id, tenantId));
  await Promise.all([owner.client.end(), runtime.client.end()]);
});

describe("PostgreSQL review intake", () => {
  const resolver = createPostgresTenantResolver(runtime.database);
  const store = createPostgresReviewIntakeStore(runtime.database);

  it("resolves the WorkOS organization through row security", async () => {
    await expect(resolver.findByOrganizationId(organizationId)).resolves.toEqual({
      id: tenantId,
      organizationId,
    });
    await expect(resolver.findByOrganizationId(`org_${randomUUID()}`)).resolves.toBeNull();
  });

  it("atomically stores a pending case and its first audit event", async () => {
    const created = await createReviewIntake(input, { actorId: "user_01", tenantId }, store);

    expect(created).toMatchObject({
      externalReference,
      replayed: false,
      status: "pending",
    });

    const [storedCase] = await owner.database
      .select()
      .from(reviewCases)
      .where(eq(reviewCases.id, created.id));
    const storedEvent = await owner.database
      .select()
      .from(reviewEvents)
      .where(eq(reviewEvents.caseId, created.id));

    expect(storedCase).toMatchObject({
      recommendation: "deny",
      status: "pending",
      tenantId,
    });
    expect(storedEvent).toHaveLength(1);
    expect(storedEvent[0]).toMatchObject({
      actorId: "user_01",
      eventType: "case_created",
      previousHash: null,
      tenantId,
    });
  });

  it("replays matching intake without adding an event", async () => {
    const replayed = await createReviewIntake(input, { actorId: "user_01", tenantId }, store);
    const events = await owner.database
      .select()
      .from(reviewEvents)
      .where(eq(reviewEvents.caseId, replayed.id));

    expect(replayed.replayed).toBe(true);
    expect(events).toHaveLength(1);
  });

  it("rejects changed content for the same external reference", async () => {
    await expect(
      createReviewIntake(
        { ...input, policyVersion: "commercial-property-2026-02" },
        { actorId: "user_01", tenantId },
        store,
      ),
    ).rejects.toBeInstanceOf(ReviewIntakeConflictError);
  });

  it("rolls back the case if its audit event cannot be inserted", async () => {
    const [existingEvent] = await owner.database
      .select({ eventHash: reviewEvents.eventHash })
      .from(reviewEvents)
      .where(eq(reviewEvents.tenantId, tenantId))
      .limit(1);
    const failedCaseId = randomUUID();
    const record: ReviewIntakeRecord = {
      ...input,
      actorId: "user_01",
      caseId: failedCaseId,
      eventHash: existingEvent?.eventHash ?? "missing-event-hash",
      externalReference: `claim_${randomUUID()}`,
      fingerprint: `sha256:${"b".repeat(64)}`,
      occurredAt: new Date(),
      tenantId,
    };

    await expect(store.create(record)).rejects.toThrow();

    const cases = await owner.database
      .select()
      .from(reviewCases)
      .where(eq(reviewCases.id, failedCaseId));
    expect(cases).toHaveLength(0);
  });
});
