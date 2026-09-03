import { describe, expect, it } from "vitest";
import type { GenLayerAttestationRequest } from "@hollis/contracts";
import {
  GenLayerAttestationProvider,
  type GenLayerIntelligentContractClient,
} from "./attestation.js";

const digest = `sha256:${"a".repeat(64)}`;

const request = {
  caseFile: {
    auditManifestHash: digest,
    caseCommitment: digest,
    evidence: [{ digest, mediaType: "application/pdf", verified: true }],
    policy: {
      control: {
        attestationCriterion: "A human decision and a verified evidence reference are required.",
        controlId: "claims-human-review",
        controlVersion: "2026-09",
        evidenceRequirement: "verified_reference_required",
        interpretation: "judgment_required",
        policyDocumentDigest: digest,
      },
      policyId: "claims",
      policyVersion: "2026-09",
    },
    review: {
      decisionRecorded: true,
      escalationRecorded: true,
      humanDecisionOutcome: "modified",
      reviewerActionCommitment: digest,
    },
    schemaVersion: "hollis.adjudication-case.v1" as const,
  },
  idempotencyKey: digest,
  publicCaseFileUrl: "https://attestations.example.test/case.json",
} satisfies GenLayerAttestationRequest;

describe("GenLayerAttestationProvider", () => {
  it("maps only validated privacy-safe fields into a GenLayer submission", async () => {
    let received: unknown;
    const client: GenLayerIntelligentContractClient = {
      async getPolicyProcessAttestation() {
        throw new Error("Not expected.");
      },
      async submitPolicyProcessAttestation(input) {
        received = input;
        return {
          contractAddress: "0x1111111111111111111111111111111111111111",
          provider: "genlayer",
          providerSubmissionId: "submission-001",
          status: "submitted",
          transactionHash: null,
          verdict: null,
        };
      },
    };

    const receipt = await new GenLayerAttestationProvider(client).submit(request);

    expect(receipt.status).toBe("submitted");
    expect(received).toMatchObject({
      caseCommitment: digest,
      evidenceRequirement: "verified_reference_required",
      policyControlId: "claims-human-review",
    });
    expect(received).not.toHaveProperty("evidence");
  });

  it("rejects an invalid provider receipt", async () => {
    const client: GenLayerIntelligentContractClient = {
      async getPolicyProcessAttestation() {
        return {};
      },
      async submitPolicyProcessAttestation() {
        return {};
      },
    };

    await expect(new GenLayerAttestationProvider(client).submit(request)).rejects.toThrow();
  });
});
