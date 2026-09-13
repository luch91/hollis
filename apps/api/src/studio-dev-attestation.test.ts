import { describe, expect, it } from "vitest";
import type { GenLayerAttestationRequest } from "@hollis/contracts";
import {
  StudioDevAttestationVerificationError,
  StudioDevAttestationVerifier,
  type StudioDevReadClient,
} from "./studio-dev-attestation.js";

const contractAddress = "0x1fcA673F741CDE49A442E156Cfc2abE74dd25EA2";
const transactionHash = `0x${"b".repeat(64)}`;
const caseCommitment = `sha256:${"1".repeat(64)}`;
const publicCaseFileUrl =
  "https://thehollis.vercel.app/attestation-cases/v1/deterministic-pass.json";

const request = {
  caseFile: {
    auditManifestHash: caseCommitment,
    caseCommitment,
    evidence: [
      { digest: `sha256:${"a".repeat(64)}`, mediaType: "application/json", verified: true },
    ],
    policy: {
      control: {
        attestationCriterion: "A human decision and a verified evidence reference are required.",
        controlId: "claims-human-review",
        controlVersion: "2026-09",
        evidenceRequirement: "verified_reference_required",
        interpretation: "deterministic",
        policyDocumentDigest: `sha256:${"a".repeat(64)}`,
      },
      policyId: "claims",
      policyVersion: "2026-09",
    },
    review: {
      decisionRecorded: true,
      escalationRecorded: false,
      humanDecisionOutcome: "approved",
      reviewerActionCommitment: `sha256:${"c".repeat(64)}`,
    },
    schemaVersion: "hollis.adjudication-case.v1" as const,
  },
  idempotencyKey: `sha256:${"d".repeat(64)}`,
  publicCaseFileUrl,
} satisfies GenLayerAttestationRequest;

function createClient(overrides: Partial<StudioDevReadClient> = {}): StudioDevReadClient {
  return {
    async getTransaction() {
      return {
        data: {
          calldata: {
            readable: `{"":"adjudicate""args":["${caseCommitment}","${publicCaseFileUrl}",]}`,
          },
        },
        lifecycle: { outcome: "accepted", state: "finalized" },
        status_name: "FINALIZED",
        to_address: contractAddress,
      };
    },
    async readContract({ args, functionName }) {
      const results =
        args[0] === `sha256:${"5".repeat(64)}`
          ? {
              get_evaluation_reason: "human_decision_missing",
              get_status: "finalized",
              get_verdict: "fail",
            }
          : {
              get_evaluation_reason: "requirements_satisfied",
              get_status: "finalized",
              get_verdict: "pass",
            };
      return results[functionName];
    },
    ...overrides,
  };
}

describe("StudioDevAttestationVerifier", () => {
  it("requires retained representative results before the importer can be activated", async () => {
    const verifier = new StudioDevAttestationVerifier(createClient(), contractAddress);

    await expect(verifier.assertRepresentativeState()).resolves.toBeUndefined();
  });

  it("rejects activation when the representative results are absent", async () => {
    const client = createClient({
      async readContract() {
        return "not_found";
      },
    });

    await expect(
      new StudioDevAttestationVerifier(client, contractAddress).assertRepresentativeState(),
    ).rejects.toThrow("has not retained the required representative pass and fail results");
  });

  it("imports only a finalized attestation that matches the case and public case file", async () => {
    const receipt = await new StudioDevAttestationVerifier(
      createClient(),
      contractAddress,
    ).importFinalized({
      caseFile: request.caseFile,
      publicCaseFileUrl,
      transactionHash,
    });

    expect(receipt).toEqual({
      contractAddress,
      provider: "genlayer",
      providerSubmissionId: transactionHash,
      status: "finalized",
      transactionHash,
      verdict: "pass",
    });
  });

  it("rejects a transaction addressed to another contract", async () => {
    const client = createClient({
      async getTransaction() {
        return {
          data: {
            calldata: {
              readable: `{"":"adjudicate""args":["${caseCommitment}","${publicCaseFileUrl}",]}`,
            },
          },
          lifecycle: { outcome: "accepted", state: "finalized" },
          status_name: "FINALIZED",
          to_address: "0x1111111111111111111111111111111111111111",
        };
      },
    });

    await expect(
      new StudioDevAttestationVerifier(client, contractAddress).importFinalized({
        caseFile: request.caseFile,
        publicCaseFileUrl,
        transactionHash,
      }),
    ).rejects.toBeInstanceOf(StudioDevAttestationVerificationError);
  });

  it("rejects a transaction that does not bind the expected case commitment", async () => {
    const otherCommitment = `sha256:${"2".repeat(64)}`;
    const client = createClient({
      async getTransaction() {
        return {
          data: {
            calldata: {
              readable: `{"":"adjudicate""args":["${otherCommitment}","${publicCaseFileUrl}",]}`,
            },
          },
          lifecycle: { outcome: "accepted", state: "finalized" },
          status_name: "FINALIZED",
          to_address: contractAddress,
        };
      },
    });

    await expect(
      new StudioDevAttestationVerifier(client, contractAddress).importFinalized({
        caseFile: request.caseFile,
        publicCaseFileUrl,
        transactionHash,
      }),
    ).rejects.toThrow("case commitment does not match");
  });

  it("rejects a transaction without a finalized stored case result", async () => {
    const client = createClient({
      async readContract({ functionName }) {
        const results = {
          get_evaluation_reason: "not_found",
          get_status: "not_found",
          get_verdict: "not_found",
        } as const;
        return results[functionName];
      },
    });

    await expect(
      new StudioDevAttestationVerifier(client, contractAddress).importFinalized({
        caseFile: request.caseFile,
        publicCaseFileUrl,
        transactionHash,
      }),
    ).rejects.toThrow("case result is not finalized");
  });
});
