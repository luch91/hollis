import { type PolicyContractBinding, policyContractBindingSchema } from "@hollis/contracts";
import { createAccount, createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { type Hash, TransactionHashVariant } from "genlayer-js/types";
import { z } from "zod";
import {
  type PolicyContractDeploymentClient,
  policyContractConstructorArguments,
} from "./policy-contract-deployment.js";

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const transactionHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const policyBindingViewSchema = z
  .object({
    attestationCriterion: z.string(),
    evidenceRequirement: z.enum(["none", "reference_required", "verified_reference_required"]),
    interpretation: z.enum(["deterministic", "judgment_required"]),
    policyControlId: z.string(),
    policyControlVersion: z.string(),
    policyDocumentDigest: z.string(),
    policyId: z.string(),
    policyVersion: z.string(),
  })
  .strict();
const finalizedDeploymentSchema = z
  .object({
    lifecycle: z.object({ outcome: z.string(), state: z.literal("finalized") }).passthrough(),
    statusName: z.literal("FINALIZED"),
    to_address: addressSchema,
    txExecutionResultName: z.string(),
  })
  .passthrough();

type RuntimeAccount = ReturnType<typeof createAccount>;

export interface StudioDevPolicyContractSdkClient {
  deployContract(input: {
    account: RuntimeAccount;
    args: string[];
    code: string;
    fees: { distribution: unknown; feeValue: bigint };
  }): Promise<string>;
  estimateTransactionFees(): Promise<{ distribution: unknown; feeValue: bigint }>;
  readContract(input: {
    address: `0x${string}`;
    args: string[];
    functionName: "get_policy_binding";
    transactionHashVariant: TransactionHashVariant;
  }): Promise<unknown>;
  waitForFinalization(input: {
    fullTransaction: true;
    hash: string;
    interval: number;
    retries: number;
  }): Promise<unknown>;
}

export class StudioDevPolicyContractClient implements PolicyContractDeploymentClient {
  constructor(
    private readonly client: StudioDevPolicyContractSdkClient,
    private readonly account: RuntimeAccount,
  ) {}

  async deploy(input: { binding: PolicyContractBinding; source: string }): Promise<string> {
    const fees = await this.client.estimateTransactionFees();
    return transactionHashSchema.parse(
      await this.client.deployContract({
        account: this.account,
        args: policyContractConstructorArguments(input.binding),
        code: input.source,
        fees,
      }),
    );
  }

  async waitForFinalization(transactionHash: string) {
    const transaction = finalizedDeploymentSchema.parse(
      await this.client.waitForFinalization({
        fullTransaction: true,
        hash: transactionHashSchema.parse(transactionHash),
        interval: 5_000,
        retries: 120,
      }),
    );
    return {
      contractAddress: transaction.to_address,
      executionSucceeded:
        transaction.lifecycle.outcome === "accepted" &&
        transaction.txExecutionResultName === "FINISHED_WITH_RETURN",
    };
  }

  async probeFinalization(transactionHash: string) {
    try {
      const transaction = finalizedDeploymentSchema.parse(
        await this.client.waitForFinalization({
          fullTransaction: true,
          hash: transactionHashSchema.parse(transactionHash),
          interval: 5_000,
          retries: 1,
        }),
      );
      return {
        contractAddress: transaction.to_address,
        executionSucceeded:
          transaction.lifecycle.outcome === "accepted" &&
          transaction.txExecutionResultName === "FINISHED_WITH_RETURN",
      };
    } catch {
      return null;
    }
  }

  async readBinding(contractAddress: string): Promise<PolicyContractBinding> {
    const result = await this.client.readContract({
      address: addressSchema.parse(contractAddress) as `0x${string}`,
      args: [],
      functionName: "get_policy_binding",
      transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
    });
    if (typeof result !== "string") {
      throw new Error("The policy contract binding view did not return JSON text.");
    }
    const binding = policyBindingViewSchema.parse(JSON.parse(result));
    return policyContractBindingSchema.parse({
      control: {
        attestationCriterion: binding.attestationCriterion,
        controlId: binding.policyControlId,
        controlVersion: binding.policyControlVersion,
        evidenceRequirement: binding.evidenceRequirement,
        interpretation: binding.interpretation,
        policyDocumentDigest: binding.policyDocumentDigest,
      },
      policyId: binding.policyId,
      policyVersion: binding.policyVersion,
    });
  }
}

export function createStudioDevPolicyContractClient(
  privateKey: string,
  rpcUrl: string,
): StudioDevPolicyContractClient {
  const account = createAccount(privateKey as `0x${string}`);
  const client = createClient({ account, chain: studioDevnet, endpoint: rpcUrl });
  return new StudioDevPolicyContractClient(
    {
      deployContract: (input) =>
        client.deployContract(input as Parameters<typeof client.deployContract>[0]),
      estimateTransactionFees: () => client.estimateTransactionFees(),
      readContract: (input) => client.readContract(input),
      waitForFinalization: (input) =>
        client.waitForFinalization({
          ...input,
          hash: input.hash as unknown as Hash,
        }),
    },
    account,
  );
}
