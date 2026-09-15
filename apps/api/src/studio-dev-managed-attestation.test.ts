import { createAccount, generatePrivateKey } from "genlayer-js";
import { TransactionHashVariant } from "genlayer-js/types";
import { describe, expect, it, vi } from "vitest";
import {
  StudioDevManagedAttestationClient,
  type StudioDevManagedAttestationSdkClient,
} from "./studio-dev-managed-attestation.js";

const transactionHash = `0x${"1".repeat(64)}`;
const contractAddress = `0x${"2".repeat(40)}`;
const commitment = `sha256:${"3".repeat(64)}`;
const publicCaseFileUrl = "https://api.hollis.test/v1/public/attestation-case-files/case";

function sdk() {
  return {
    estimateTransactionFeesForWrite: vi.fn(async () => ({ distribution: {}, feeValue: 1n })),
    readContract: vi.fn(async ({ functionName }) => {
      if (functionName === "get_status") return "finalized";
      if (functionName === "get_verdict") return "pass";
      return "requirements_satisfied";
    }),
    waitForFinalization: vi.fn(async () => ({
      lifecycle: { outcome: "accepted", state: "finalized" },
      statusName: "FINALIZED",
      txExecutionResultName: "FINISHED_WITH_RETURN",
    })),
    writeContract: vi.fn(async () => transactionHash),
  } satisfies StudioDevManagedAttestationSdkClient;
}

describe("Studio Dev managed attestation client", () => {
  it("submits the case commitment and controlled public URL", async () => {
    const account = createAccount(generatePrivateKey());
    const client = sdk();
    const adapter = new StudioDevManagedAttestationClient(client, account);

    await expect(
      adapter.submit({ caseCommitment: commitment, contractAddress, publicCaseFileUrl }),
    ).resolves.toBe(transactionHash);
    expect(client.writeContract).toHaveBeenCalledWith({
      account,
      address: contractAddress,
      args: [commitment, publicCaseFileUrl],
      fees: { distribution: {}, feeValue: 1n },
      functionName: "adjudicate",
    });
  });

  it("accepts only finalized successful execution", async () => {
    const adapter = new StudioDevManagedAttestationClient(
      sdk(),
      createAccount(generatePrivateKey()),
    );

    await expect(adapter.waitForFinalization(transactionHash)).resolves.toEqual({
      executionSucceeded: true,
    });
  });

  it("reads all retained case result views from finalized state", async () => {
    const client = sdk();
    const adapter = new StudioDevManagedAttestationClient(
      client,
      createAccount(generatePrivateKey()),
    );

    await expect(
      adapter.readResult({ caseCommitment: commitment, contractAddress }),
    ).resolves.toEqual({
      evaluationReason: "requirements_satisfied",
      status: "finalized",
      verdict: "pass",
    });
    expect(client.readContract).toHaveBeenCalledTimes(3);
    expect(client.readContract).toHaveBeenCalledWith({
      address: contractAddress,
      args: [commitment],
      functionName: "get_status",
      transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
    });
  });
});
