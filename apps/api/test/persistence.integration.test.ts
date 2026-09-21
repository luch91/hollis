import { randomUUID } from "node:crypto";
import { reviewExportSchema } from "@hollis/contracts";
import {
  createDatabase,
  evidenceAttachments,
  evidenceObjects,
  evidenceUploads,
  policyControls,
  policyVersions,
  reviewCases,
  reviewEvents,
  tenants,
  users,
} from "@hollis/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createEvidenceUpload, verifyEvidenceUpload } from "../src/evidence.js";
import type { EvidenceStorage } from "../src/evidence-storage.js";
import {
  createPostgresEvidenceMetadataStore,
  createPostgresReviewIntakeStore,
  createPostgresReviewWorkflowStore,
  createPostgresTenantResolver,
} from "../src/persistence.js";
import {
  createReviewIntake,
  ReviewIntakeConflictError,
  type ReviewIntakeRecord,
} from "../src/review-intake.js";

const ownerUrl = process.env.DATABASE_TEST_URL;
const runtimeUrl = process.env.DATABASE_URL;
if (!ownerUrl || !runtimeUrl) {
  throw new Error("DATABASE_TEST_URL and DATABASE_URL are required for persistence tests.");
}

const owner = createDatabase(ownerUrl);
const runtime = createDatabase(runtimeUrl);
const tenantId = randomUUID();
const policyAuthorId = randomUUID();
const policyVersionId = randomUUID();
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
  policyId: "commercial-property",
  policyVersion: "commercial-property-2026-01",
  recommendation: "deny" as const,
  riskLevel: "high" as const,
  reviewDueAt: "2026-08-29T08:00:00.000Z",
  ruleId: "human-review-adverse-action",
};

beforeAll(async () => {
  await owner.database.insert(tenants).values({
    id: tenantId,
    name: "Persistence integration tenant",
  });
  await owner.database.insert(users).values({
    displayName: "Persistence integration policy author",
    email: `policy-author-${policyAuthorId}@hollis.test`,
    emailVerifiedAt: new Date(),
    id: policyAuthorId,
  });
  await owner.database.insert(policyVersions).values({
    createdByUserId: policyAuthorId,
    documentDigest: `sha256:${"p".repeat(64)}`,
    id: policyVersionId,
    policyId: input.policyId,
    tenantId,
    title: "Persistence integration policy",
    version: input.policyVersion,
  });
  await owner.database.insert(policyControls).values({
    attestationCriterion: "A frozen verified reference and recorded human decision are required.",
    controlId: input.ruleId,
    controlVersion: "1.0",
    evidenceRequirement: "verified_reference_required",
    interpretation: "deterministic",
    policyVersionId,
    tenantId,
    title: "Human review",
  });
});

afterAll(async () => {
  await owner.database
    .delete(evidenceAttachments)
    .where(eq(evidenceAttachments.tenantId, tenantId));
  await owner.database.delete(evidenceUploads).where(eq(evidenceUploads.tenantId, tenantId));
  await owner.database.delete(evidenceObjects).where(eq(evidenceObjects.tenantId, tenantId));
  await owner.database.delete(reviewEvents).where(eq(reviewEvents.tenantId, tenantId));
  await owner.database.delete(reviewCases).where(eq(reviewCases.tenantId, tenantId));
  await owner.database.delete(policyControls).where(eq(policyControls.tenantId, tenantId));
  await owner.database.delete(policyVersions).where(eq(policyVersions.tenantId, tenantId));
  await owner.database.delete(tenants).where(eq(tenants.id, tenantId));
  await owner.database.delete(users).where(eq(users.id, policyAuthorId));
  await Promise.all([owner.client.end(), runtime.client.end()]);
});

describe("PostgreSQL review intake", () => {
  const resolver = createPostgresTenantResolver(runtime.database);
  const store = createPostgresReviewIntakeStore(runtime.database);
  const workflowStore = createPostgresReviewWorkflowStore(runtime.database);
  const evidenceMetadataStore = createPostgresEvidenceMetadataStore(runtime.database);
  const testStorage: EvidenceStorage = {
    async createDownloadUrl() {
      return "https://evidence.test/download";
    },
    async createUploadUrl() {
      return "https://evidence.test/upload";
    },
    async delete() {},
    async promote(_tenantId, _quarantineObjectName, immutableObjectName) {
      return {
        digest: `sha256:${immutableObjectName.split("/").at(-1)}`,
        mediaType: "application/pdf",
        objectName: immutableObjectName,
        providerEtag: "test-etag",
        providerVersion: "test-version-1",
        sizeBytes: 128,
      };
    },
    async put(_tenantId, objectName, content, mediaType, expectedDigest) {
      return { digest: expectedDigest, mediaType, objectName, sizeBytes: content.byteLength };
    },
    async verify(_tenantId, objectName, expected) {
      return {
        ...expected,
        objectName,
        providerEtag: "test-etag",
        providerVersion: "test-version-1",
      };
    },
  };

  async function makeReviewable(caseId: string) {
    const [object] = await owner.database
      .insert(evidenceObjects)
      .values({
        digest: input.evidence[0].digest,
        mediaType: input.evidence[0].mediaType,
        objectName: `tenants/${tenantId}/evidence/final/${input.evidence[0].digest.slice(7)}`,
        providerVersion: "test-version-1",
        sizeBytes: 128,
        tenantId,
        verified: true,
        verifiedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: evidenceObjects.id });
    const evidenceObjectId =
      object?.id ??
      (
        await owner.database
          .select({ id: evidenceObjects.id })
          .from(evidenceObjects)
          .where(eq(evidenceObjects.tenantId, tenantId))
          .limit(1)
      )[0]?.id;
    if (!evidenceObjectId) throw new Error("Test evidence object was not created.");
    const [attachment] = await owner.database
      .insert(evidenceAttachments)
      .values({
        attachedByUserId: "user_01",
        caseId,
        evidenceObjectId,
        ordinal: 1,
        tenantId,
      })
      .returning({ id: evidenceAttachments.id });
    await owner.database
      .update(reviewCases)
      .set({
        evidence: [{ ...input.evidence[0], id: attachment.id }],
        evidenceFrozenAt: new Date(),
        status: "pending",
      })
      .where(eq(reviewCases.id, caseId));
  }

  it("resolves the active tenant through row security", async () => {
    await expect(resolver.findByTenantId(tenantId)).resolves.toEqual({ id: tenantId });
    await expect(resolver.findByTenantId(randomUUID())).resolves.toBeNull();
  });

  it("atomically stores a draft case and its first audit event", async () => {
    const created = await createReviewIntake(input, { actorId: "user_01", tenantId }, store);

    expect(created).toMatchObject({
      externalReference,
      replayed: false,
      status: "draft",
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
      status: "draft",
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

  it("attaches immutable evidence idempotently and freezes it when review starts", async () => {
    const draft = await createReviewIntake(
      { ...input, externalReference: `ledger_${randomUUID()}` },
      { actorId: "user_01", tenantId },
      store,
    );
    const first = await createEvidenceUpload(
      tenantId,
      draft.id,
      { digest: `sha256:${"c".repeat(64)}`, mediaType: "application/pdf", sizeBytes: 128 },
      testStorage,
      evidenceMetadataStore,
    );
    await verifyEvidenceUpload(
      tenantId,
      draft.id,
      first.evidenceId,
      testStorage,
      evidenceMetadataStore,
      "user_01",
    );
    const second = await createEvidenceUpload(
      tenantId,
      draft.id,
      { digest: `sha256:${"d".repeat(64)}`, mediaType: "application/pdf", sizeBytes: 128 },
      testStorage,
      evidenceMetadataStore,
    );
    await verifyEvidenceUpload(
      tenantId,
      draft.id,
      second.evidenceId,
      testStorage,
      evidenceMetadataStore,
      "user_01",
    );
    const retry = await createEvidenceUpload(
      tenantId,
      draft.id,
      { digest: `sha256:${"c".repeat(64)}`, mediaType: "application/pdf", sizeBytes: 128 },
      testStorage,
      evidenceMetadataStore,
    );
    await verifyEvidenceUpload(
      tenantId,
      draft.id,
      retry.evidenceId,
      testStorage,
      evidenceMetadataStore,
      "user_01",
    );
    const detail = await workflowStore.get(tenantId, draft.id);
    expect(detail).toMatchObject({ status: "pending" });
    expect(detail?.evidence.map((item) => item.digest)).toEqual([
      `sha256:${"c".repeat(64)}`,
      `sha256:${"d".repeat(64)}`,
    ]);
    const events = await owner.database
      .select()
      .from(reviewEvents)
      .where(eq(reviewEvents.caseId, draft.id));
    expect(events.filter((event) => event.eventType === "evidence_added")).toHaveLength(2);

    await workflowStore.claim(tenantId, "user_01", draft.id);
    await expect(
      createEvidenceUpload(
        tenantId,
        draft.id,
        { digest: `sha256:${"d".repeat(64)}`, mediaType: "application/pdf", sizeBytes: 128 },
        testStorage,
        evidenceMetadataStore,
      ),
    ).rejects.toThrow("transition");
  });

  it("records a safe audit event when evidence verification fails", async () => {
    const draft = await createReviewIntake(
      { ...input, externalReference: `failed_upload_${randomUUID()}` },
      { actorId: "user_01", tenantId },
      store,
    );
    const upload = await createEvidenceUpload(
      tenantId,
      draft.id,
      { digest: `sha256:${"e".repeat(64)}`, mediaType: "application/pdf", sizeBytes: 128 },
      testStorage,
      evidenceMetadataStore,
    );
    await expect(
      verifyEvidenceUpload(
        tenantId,
        draft.id,
        upload.evidenceId,
        {
          ...testStorage,
          async verify() {
            throw new Error("synthetic verification failure");
          },
        },
        evidenceMetadataStore,
        "user_01",
      ),
    ).rejects.toThrow("declared metadata");
    const [storedUpload] = await owner.database
      .select({ failureCode: evidenceUploads.failureCode, state: evidenceUploads.state })
      .from(evidenceUploads)
      .where(eq(evidenceUploads.id, upload.evidenceId));
    expect(storedUpload).toEqual({ failureCode: "verification_failed", state: "failed" });
    const events = await owner.database
      .select()
      .from(reviewEvents)
      .where(eq(reviewEvents.caseId, draft.id));
    expect(events.some((event) => event.eventType === "evidence_upload_failed")).toBe(true);
  });

  it("bounds cleanup of expired quarantine objects and records the cleanup", async () => {
    const draft = await createReviewIntake(
      { ...input, externalReference: `expired_upload_${randomUUID()}` },
      { actorId: "user_01", tenantId },
      store,
    );
    const expiredId = randomUUID();
    const objectName = `tenants/${tenantId}/evidence/quarantine/${expiredId}`;
    await owner.database.insert(evidenceUploads).values({
      caseId: draft.id,
      digest: `sha256:${"f".repeat(64)}`,
      expiresAt: new Date(Date.now() - 1_000),
      id: expiredId,
      mediaType: "application/pdf",
      quarantineObjectName: objectName,
      sizeBytes: 128,
      tenantId,
    });
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    await createEvidenceUpload(
      tenantId,
      draft.id,
      { digest: `sha256:${"1".repeat(64)}`, mediaType: "application/pdf", sizeBytes: 128 },
      { ...testStorage, delete: deleteObject },
      evidenceMetadataStore,
    );
    expect(deleteObject).toHaveBeenCalledWith(tenantId, objectName);
    const [storedUpload] = await owner.database
      .select({ state: evidenceUploads.state })
      .from(evidenceUploads)
      .where(eq(evidenceUploads.id, expiredId));
    expect(storedUpload).toEqual({ state: "cleaned" });
    const events = await owner.database
      .select()
      .from(reviewEvents)
      .where(eq(reviewEvents.caseId, draft.id));
    expect(events.some((event) => event.eventType === "evidence_quarantine_cleaned")).toBe(true);
  });

  it("enforces claim, escalation, handoff, and human decision transitions", async () => {
    const workflowCase = await createReviewIntake(
      { ...input, externalReference: `workflow_${randomUUID()}` },
      { actorId: "user_01", tenantId },
      store,
    );
    await makeReviewable(workflowCase.id);

    const claimed = await workflowStore.claim(tenantId, "user_01", workflowCase.id);
    expect(claimed).toMatchObject({ case: { status: "in_review" }, replayed: false });

    const escalated = await workflowStore.escalate(tenantId, "user_01", workflowCase.id, {
      reason: "Requires senior review.",
    });
    expect(escalated).toMatchObject({ case: { status: "escalated" }, replayed: false });

    const handedOff = await workflowStore.claim(tenantId, "user_02", workflowCase.id);
    expect(handedOff).toMatchObject({
      case: { assignedToUserId: "user_02", status: "in_review" },
      replayed: false,
    });

    const knownLimitations =
      "The reviewer relied on the frozen case evidence and did not independently verify external records.";
    await workflowStore.acknowledgeDecisionPacket(
      tenantId,
      "user_02",
      workflowCase.id,
      knownLimitations,
    );
    const decided = await workflowStore.decide(tenantId, "user_02", workflowCase.id, {
      finalRecommendation: "refer",
      knownLimitations,
      outcome: "modified",
      rationale: "The reviewer changed the recommendation after examining the evidence.",
    });
    expect(decided).toMatchObject({
      case: {
        decisionOutcome: "modified",
        decidedByUserId: "user_02",
        finalRecommendation: "refer",
        status: "completed",
      },
      replayed: false,
    });

    await expect(
      workflowStore.decide(tenantId, "user_02", workflowCase.id, {
        finalRecommendation: "deny",
        outcome: "rejected",
        rationale: "A second decision is not allowed.",
      }),
    ).rejects.toThrow("transition");
  });

  it("creates a reproducible tenant-scoped evidence export", async () => {
    const exportedCase = await createReviewIntake(
      { ...input, externalReference: `export_${randomUUID()}` },
      { actorId: "user_01", tenantId },
      store,
    );

    const exported = await workflowStore.exportCase(tenantId, exportedCase.id);
    expect(exported).not.toBeNull();
    const parsed = reviewExportSchema.parse(exported);
    expect(parsed.schemaVersion).toBe("hollis.review-export.v1");
    expect(parsed.case.id).toBe(exportedCase.id);
    expect(parsed.case.evidence).toEqual(input.evidence);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0].eventType).toBe("case_created");
    expect(parsed.events[0].previousHash).toBeNull();
    expect(parsed.manifestHash).toMatch(/^sha256:[a-f0-9]{64}$/);
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
