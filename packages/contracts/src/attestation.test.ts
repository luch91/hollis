import { describe, expect, it } from "vitest";
import { adjudicationCaseFileSchema, policyDefinitionSchema } from "./attestation.js";

const digest = `sha256:${"a".repeat(64)}`;

const control = {
  attestationCriterion: "A human decision and a verified evidence reference are required.",
  controlId: "claims-human-review",
  controlVersion: "2026-09",
  evidenceRequirement: "verified_reference_required",
  interpretation: "judgment_required",
  policyDocumentDigest: digest,
};

describe("policyDefinitionSchema", () => {
  it("accepts a versioned policy with a bounded attestation criterion", () => {
    expect(
      policyDefinitionSchema.safeParse({
        controls: [control],
        policyId: "claims",
        policyVersion: "2026-09",
        schemaVersion: "hollis.policy.v1",
      }).success,
    ).toBe(true);
  });

  it("rejects duplicate control IDs", () => {
    expect(
      policyDefinitionSchema.safeParse({
        controls: [control, control],
        policyId: "claims",
        policyVersion: "2026-09",
        schemaVersion: "hollis.policy.v1",
      }).success,
    ).toBe(false);
  });
});

describe("adjudicationCaseFileSchema", () => {
  it("accepts only privacy-safe commitments and evidence metadata", () => {
    expect(
      adjudicationCaseFileSchema.safeParse({
        auditManifestHash: digest,
        caseCommitment: digest,
        evidence: [{ digest, mediaType: "application/pdf", verified: true }],
        policy: { control, policyId: "claims", policyVersion: "2026-09" },
        review: {
          decisionRecorded: true,
          escalationRecorded: true,
          humanDecisionOutcome: "modified",
          reviewerActionCommitment: digest,
        },
        schemaVersion: "hollis.adjudication-case.v1",
      }).success,
    ).toBe(true);
  });

  it("rejects case files with caller-supplied raw evidence", () => {
    expect(
      adjudicationCaseFileSchema.safeParse({
        auditManifestHash: digest,
        caseCommitment: digest,
        evidence: [
          { digest, mediaType: "application/pdf", rawEvidence: "do not disclose", verified: true },
        ],
        policy: { control, policyId: "claims", policyVersion: "2026-09" },
        review: {
          decisionRecorded: true,
          escalationRecorded: false,
          humanDecisionOutcome: "approved",
          reviewerActionCommitment: digest,
        },
        schemaVersion: "hollis.adjudication-case.v1",
      }).success,
    ).toBe(false);
  });
});
