import { policyContractBindingSchema, type PolicyContractBinding } from "@hollis/contracts";
import { createAccount, createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { TransactionHashVariant, type Hash } from "genlayer-js/types";
import { z } from "zod";
import {
  policyContractConstructorArguments,
  type PolicyContractDeploymentClient,
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
  deployContract(input: { account: RuntimeAccount; args: string[]; code: string }): Promise<string>;
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
    return transactionHashSchema.parse(
      await this.client.deployContract({
        account: this.account,
        args: policyContractConstructorArguments(input.binding),
        code: input.source,
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
): StudioDevPolicyContractClient {
  const account = createAccount(privateKey as `0x${string}`);
  const client = createClient({ account, chain: studioDevnet });
  return new StudioDevPolicyContractClient(
    {
      deployContract: (input) => client.deployContract(input),
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
