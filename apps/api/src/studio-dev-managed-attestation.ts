import { createAccount, createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { TransactionHashVariant, type Hash } from "genlayer-js/types";
import { z } from "zod";
import type { ManagedAttestationClient } from "./managed-attestation-submission.js";

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const commitmentSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const transactionHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const finalizedTransactionSchema = z
  .object({
    lifecycle: z.object({ outcome: z.string(), state: z.literal("finalized") }).passthrough(),
    statusName: z.literal("FINALIZED"),
    txExecutionResultName: z.string(),
  })
  .passthrough();

type RuntimeAccount = ReturnType<typeof createAccount>;

export interface StudioDevManagedAttestationSdkClient {
  readContract(input: {
    address: `0x${string}`;
    args: string[];
    functionName: "get_evaluation_reason" | "get_status" | "get_verdict";
    transactionHashVariant: TransactionHashVariant;
  }): Promise<unknown>;
  waitForFinalization(input: {
    fullTransaction: true;
    hash: string;
    interval: number;
    retries: number;
  }): Promise<unknown>;
  writeContract(input: {
    account: RuntimeAccount;
    address: `0x${string}`;
    args: string[];
    functionName: "adjudicate";
  }): Promise<string>;
}

function viewResult(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new Error(`The ${name} contract view did not return text.`);
  }
  return value;
}

export class StudioDevManagedAttestationClient implements ManagedAttestationClient {
  constructor(
    private readonly client: StudioDevManagedAttestationSdkClient,
    private readonly account: RuntimeAccount,
  ) {}

  async submit(input: {
    caseCommitment: string;
    contractAddress: string;
    publicCaseFileUrl: string;
  }) {
    return transactionHashSchema.parse(
      await this.client.writeContract({
        account: this.account,
        address: addressSchema.parse(input.contractAddress) as `0x${string}`,
        args: [
          commitmentSchema.parse(input.caseCommitment),
          z
            .url()
            .refine((value) => new URL(value).protocol === "https:")
            .parse(input.publicCaseFileUrl),
        ],
        functionName: "adjudicate",
      }),
    );
  }

  async waitForFinalization(transactionHash: string) {
    const transaction = finalizedTransactionSchema.parse(
      await this.client.waitForFinalization({
        fullTransaction: true,
        hash: transactionHashSchema.parse(transactionHash),
        interval: 5_000,
        retries: 120,
      }),
    );
    return {
      executionSucceeded:
        transaction.lifecycle.outcome === "accepted" &&
        transaction.txExecutionResultName === "FINISHED_WITH_RETURN",
    };
  }

  async readResult(input: { caseCommitment: string; contractAddress: string }) {
    const address = addressSchema.parse(input.contractAddress) as `0x${string}`;
    const args = [commitmentSchema.parse(input.caseCommitment)];
    const read = (functionName: "get_evaluation_reason" | "get_status" | "get_verdict") =>
      this.client.readContract({
        address,
        args,
        functionName,
        transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
      });
    const [evaluationReason, status, verdict] = await Promise.all([
      read("get_evaluation_reason"),
      read("get_status"),
      read("get_verdict"),
    ]);
    return {
      evaluationReason: viewResult(evaluationReason, "get_evaluation_reason"),
      status: viewResult(status, "get_status"),
      verdict: viewResult(verdict, "get_verdict"),
    };
  }
}

export function createStudioDevManagedAttestationClient(
  privateKey: string,
): StudioDevManagedAttestationClient {
  const account = createAccount(privateKey as `0x${string}`);
  const client = createClient({ account, chain: studioDevnet });
  return new StudioDevManagedAttestationClient(
    {
      readContract: (input) => client.readContract(input),
      waitForFinalization: (input) =>
        client.waitForFinalization({
          ...input,
          hash: input.hash as unknown as Hash,
        }),
      writeContract: (input) => client.writeContract(input),
    },
    account,
  );
}
