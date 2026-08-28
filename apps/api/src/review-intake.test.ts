import { describe, expect, it } from "vitest";
import {
  createReviewIntake,
  type ReviewIntakeRecord,
  type ReviewIntakeStore,
  ReviewIntakeConflictError,
} from "./review-intake.js";

const input = {
  automatedSystemVersion: "claims-model-2026-08",
  evidence: [
    {
      digest: `sha256:${"a".repeat(64)}`,
      id: "evidence-001",
      mediaType: "application/pdf",
    },
  ],
  externalReference: "claim-001",
  policyVersion: "commercial-property-2026-01",
  recommendation: "deny" as const,
  riskLevel: "high" as const,
  reviewDueAt: "2026-08-29T08:00:00.000Z",
  ruleId: "human-review-adverse-action",
};

const context = {
  actorId: "user_01",
  tenantId: "0198ef37-6216-7000-8000-000000000001",
};

const occurredAt = new Date("2026-08-28T08:00:00.000Z");
const caseId = "0198ef37-6216-7000-8000-000000000002";

describe("review intake", () => {
  it("records an adverse recommendation only as pending human review", async () => {
    let received: ReviewIntakeRecord | undefined;
    const store: ReviewIntakeStore = {
      async create(record) {
        received = record;
        return {
          created: true,
          reviewCase: {
            createdAt: record.occurredAt,
            externalReference: record.externalReference,
            fingerprint: record.fingerprint,
            id: record.caseId,
            reviewDueAt: new Date(record.reviewDueAt),
            status: "pending",
          },
        };
      },
    };

    const result = await createReviewIntake(input, context, store, { caseId, occurredAt });

    expect(result).toEqual({
      createdAt: "2026-08-28T08:00:00.000Z",
      externalReference: "claim-001",
      id: caseId,
      reviewDueAt: "2026-08-29T08:00:00.000Z",
      replayed: false,
      status: "pending",
    });
    expect(received).toMatchObject({
      actorId: "user_01",
      caseId,
      recommendation: "deny",
      tenantId: context.tenantId,
    });
    expect(received?.eventHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(received?.fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("returns an idempotent replay when validated content matches", async () => {
    const firstRecords: ReviewIntakeRecord[] = [];
    const store: ReviewIntakeStore = {
      async create(record) {
        firstRecords.push(record);
        return {
          created: false,
          reviewCase: {
            createdAt: occurredAt,
            externalReference: record.externalReference,
            fingerprint: record.fingerprint,
            id: caseId,
            reviewDueAt: occurredAt,
            status: "in_review",
          },
        };
      },
    };

    const result = await createReviewIntake(input, context, store, { occurredAt });

    expect(result).toMatchObject({ id: caseId, replayed: true, status: "in_review" });
  });

  it("rejects reuse of an external reference with different content", async () => {
    const store: ReviewIntakeStore = {
      async create(record) {
        return {
          created: false,
          reviewCase: {
            createdAt: occurredAt,
            externalReference: record.externalReference,
            fingerprint: `sha256:${"f".repeat(64)}`,
            id: caseId,
            reviewDueAt: occurredAt,
            status: "pending",
          },
        };
      },
    };

    await expect(createReviewIntake(input, context, store, { occurredAt })).rejects.toBeInstanceOf(
      ReviewIntakeConflictError,
    );
  });
});
