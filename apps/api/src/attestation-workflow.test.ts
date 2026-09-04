import { describe, expect, it } from "vitest";
import type { ReviewExport } from "@hollis/contracts";
import { buildGenLayerAttestationRequest } from "./attestation-workflow.js";

const digest = `sha256:${"a".repeat(64)}`;

const exported: ReviewExport = {
  case: {
    assignedToUserId: "user_01",
    automatedSystemVersion: "claims-model-2026-09",
    createdAt: "2026-09-03T12:00:00.000Z",
    decisionOutcome: "modified",
    evidence: [],
    externalReference: "claim-001",
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

    expect(request.caseFile.caseCommitment).toBe(digest);
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
});
