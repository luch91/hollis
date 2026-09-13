import { createAccount, generatePrivateKey } from "genlayer-js";
import { TransactionHashVariant } from "genlayer-js/types";
import { describe, expect, it, vi } from "vitest";
import type { PolicyContractBinding } from "@hollis/contracts";
import {
  StudioDevPolicyContractClient,
  type StudioDevPolicyContractSdkClient,
} from "./studio-dev-policy-contract.js";

const transactionHash = `0x${"1".repeat(64)}`;
const contractAddress = `0x${"2".repeat(40)}`;
const binding: PolicyContractBinding = {
  control: {
    attestationCriterion: "A human decision must be recorded.",
    controlId: "human-review-required",
    controlVersion: "1.0",
    evidenceRequirement: "verified_reference_required",
    interpretation: "deterministic",
    policyDocumentDigest: `sha256:${"3".repeat(64)}`,
  },
  policyId: "governance-policy",
  policyVersion: "2026.1",
};

function sdk() {
  return {
    deployContract: vi.fn(async () => transactionHash),
    readContract: vi.fn(async () =>
      JSON.stringify({
        attestationCriterion: binding.control.attestationCriterion,
        evidenceRequirement: binding.control.evidenceRequirement,
        interpretation: binding.control.interpretation,
        policyControlId: binding.control.controlId,
        policyControlVersion: binding.control.controlVersion,
        policyDocumentDigest: binding.control.policyDocumentDigest,
        policyId: binding.policyId,
        policyVersion: binding.policyVersion,
      }),
    ),
    waitForFinalization: vi.fn(async () => ({
      lifecycle: { outcome: "accepted", state: "finalized" },
      statusName: "FINALIZED",
      to_address: contractAddress,
      txExecutionResultName: "FINISHED_WITH_RETURN",
    })),
  } satisfies StudioDevPolicyContractSdkClient;
}

describe("Studio Dev policy contract client", () => {
  it("submits the exact V7 constructor order", async () => {
    const account = createAccount(generatePrivateKey());
    const client = sdk();
    const adapter = new StudioDevPolicyContractClient(client, account);

    await expect(adapter.deploy({ binding, source: "contract source" })).resolves.toBe(
      transactionHash,
    );
    expect(client.deployContract).toHaveBeenCalledWith({
      account,
      args: [
        "governance-policy",
        "2026.1",
        "human-review-required",
        "1.0",
        `sha256:${"3".repeat(64)}`,
        "A human decision must be recorded.",
        "verified_reference_required",
        "deterministic",
      ],
      code: "contract source",
    });
  });

  it("requires finalized accepted execution before returning a contract address", async () => {
    const account = createAccount(generatePrivateKey());
    const client = sdk();
    const adapter = new StudioDevPolicyContractClient(client, account);

    await expect(adapter.waitForFinalization(transactionHash)).resolves.toEqual({
      contractAddress,
      executionSucceeded: true,
    });
  });

  it("reads the immutable binding from finalized state", async () => {
    const account = createAccount(generatePrivateKey());
    const client = sdk();
    const adapter = new StudioDevPolicyContractClient(client, account);

    await expect(adapter.readBinding(contractAddress)).resolves.toEqual(binding);
    expect(client.readContract).toHaveBeenCalledWith({
      address: contractAddress,
      args: [],
      functionName: "get_policy_binding",
      transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
    });
  });
});
