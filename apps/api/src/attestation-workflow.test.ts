import { describe, expect, it } from "vitest";
import type { ReviewExport } from "@hollis/contracts";
import {
  buildGenLayerAttestationRequest,
  verifyAdjudicationCaseFileIntegrity,
} from "./attestation-workflow.js";

const digest = `sha256:${"a".repeat(64)}`;

const exported: ReviewExport = {
  case: {
    assignedAt: "2026-09-03T12:01:00.000Z",
    assignedToUserId: "user_01",
    automatedSystemVersion: "claims-model-2026-09",
    createdAt: "2026-09-03T12:00:00.000Z",
    decisionOutcome: "modified",
    decisionRationale: "The reviewer modified the automated recommendation.",
    decidedAt: "2026-09-03T12:02:00.000Z",
    decidedByUserId: "user_01",
    evidence: [],
    externalReference: "claim-001",
    hollisCaseReference: "HL-26-7M4K-P9Q2",
    escalatedAt: null,
    escalatedByUserId: null,
    escalationReason: null,
    finalRecommendation: "refer",
    id: "0198ef37-6216-7000-8000-000000000002",
    policyVersion: "2026-09",
    recommendation: "deny",
    reviewDueAt: "2026-09-04T12:00:00.000Z",
    riskLevel: "high",
    ruleId: "claims-human-review",
    status: "completed",
  },
  events: [
    {
      actorId: "user_01",
      createdAt: "2026-09-03T12:01:00.000Z",
      eventHash: digest,
      eventSequence: 1,
      eventType: "review_started",
      payload: {},
      previousHash: null,
    },
    {
      actorId: "user_01",
      createdAt: "2026-09-03T12:02:00.000Z",
      eventHash: digest,
      eventSequence: 2,
      eventType: "decision_recorded",
      payload: {},
      previousHash: digest,
    },
  ],
  manifestHash: digest,
  schemaVersion: "hollis.review-export.v1",
};

const input = {
  policy: {
    control: {
      attestationCriterion: "A human decision and a verified evidence reference are required.",
      controlId: "claims-human-review",
      controlVersion: "2026-09",
      evidenceRequirement: "verified_reference_required" as const,
      interpretation: "judgment_required" as const,
      policyDocumentDigest: digest,
    },
    policyId: "claims",
    policyVersion: "2026-09",
  },
  publicCaseFileUrl: "https://attestations.example.test/case.json",
};

describe("buildGenLayerAttestationRequest", () => {
  it("builds a privacy-safe case file from a completed review export", () => {
    const request = buildGenLayerAttestationRequest(
      exported,
      [{ digest, mediaType: "application/pdf", verified: true }],
      input,
    );

    expect(request.caseFile.caseCommitment).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(request.caseFile.caseCommitment).not.toBe(digest);
    expect(request.caseFile.commitmentVersion).toBe("hollis.case-commitment.v1");
    expect(request.caseFile.canonicalRecord).toMatchObject({
      auditManifestHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      canonicalization: "hollis.canonical-json.v1",
      schemaVersion: "hollis.canonical-case.v1",
    });
    expect(request.caseFile.review.humanDecisionOutcome).toBe("modified");
    expect(request.caseFile.evidence).toEqual([
      { digest, mediaType: "application/pdf", verified: true },
    ]);
  });

  it("rejects a policy control that differs from the recorded rule", () => {
    expect(() =>
      buildGenLayerAttestationRequest(
        exported,
        [{ digest, mediaType: "application/pdf", verified: true }],
        {
          ...input,
          policy: {
            ...input.policy,
            control: { ...input.policy.control, controlId: "claims-other" },
          },
        },
      ),
    ).toThrow("does not match the review case rule");
  });

  it("changes the commitment when ordered evidence changes", () => {
    const first = buildGenLayerAttestationRequest(
      exported,
      [
        { digest, mediaType: "application/pdf", verified: true },
        { digest: `sha256:${"b".repeat(64)}`, mediaType: "application/json", verified: true },
      ],
      input,
    );
    const reversed = buildGenLayerAttestationRequest(
      exported,
      [
        { digest: `sha256:${"b".repeat(64)}`, mediaType: "application/json", verified: true },
        { digest, mediaType: "application/pdf", verified: true },
      ],
      input,
    );

    expect(first.caseFile.caseCommitment).not.toBe(reversed.caseFile.caseCommitment);
  });

  it("stays stable when attestation lifecycle events follow the decision", () => {
    const before = buildGenLayerAttestationRequest(
      exported,
      [{ digest, mediaType: "application/pdf", verified: true }],
      input,
    );
    const after = buildGenLayerAttestationRequest(
      {
        ...exported,
        events: [
          ...exported.events,
          {
            actorId: "user_01",
            createdAt: "2026-09-03T12:03:00.000Z",
            eventHash: `sha256:${"b".repeat(64)}`,
            eventSequence: 3,
            eventType: "attestation_case_file_published",
            payload: {},
            previousHash: digest,
          },
        ],
        manifestHash: `sha256:${"c".repeat(64)}`,
      },
      [{ digest, mediaType: "application/pdf", verified: true }],
      input,
    );

    expect(after.caseFile.caseCommitment).toBe(before.caseFile.caseCommitment);
    expect(after.caseFile.canonicalRecord).toEqual(before.caseFile.canonicalRecord);
  });

  it("rejects a stored case file whose canonical record was changed", () => {
    const request = buildGenLayerAttestationRequest(
      exported,
      [{ digest, mediaType: "application/pdf", verified: true }],
      input,
    );
    const changed = structuredClone(request.caseFile);
    if (!changed.canonicalRecord) throw new Error("Expected a canonical record.");
    changed.canonicalRecord.review.humanDecisionOutcome = "rejected";

    expect(() => verifyAdjudicationCaseFileIntegrity(changed)).toThrow(
      "failed integrity verification",
    );
  });
});
