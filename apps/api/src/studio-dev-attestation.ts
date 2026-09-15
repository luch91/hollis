import {
  type AttestationReceipt,
  attestationReceiptSchema,
  type GenLayerAttestationRequest,
} from "@hollis/contracts";
import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";
import { type Hash, TransactionHashVariant } from "genlayer-js/types";
import { z } from "zod";

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const transactionHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const representativePassCommitment = `sha256:${"1".repeat(64)}`;
const representativeFailCommitment = `sha256:${"5".repeat(64)}`;

const studioTransactionSchema = z
  .object({
    data: z
      .object({
        calldata: z.object({ readable: z.string().min(1) }).passthrough(),
      })
      .passthrough(),
    lifecycle: z
      .object({ outcome: z.literal("accepted"), state: z.literal("finalized") })
      .passthrough(),
    status_name: z.literal("FINALIZED").optional(),
    statusName: z.literal("FINALIZED").optional(),
    to_address: addressSchema,
  })
  .passthrough()
  .refine((transaction) => transaction.status_name || transaction.statusName, {
    message: "The Studio transaction status is not finalized.",
  });

export class StudioDevAttestationVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudioDevAttestationVerificationError";
  }
}

export interface StudioDevReadClient {
  getTransaction(input: { hash: string }): Promise<unknown>;
  readContract(input: {
    address: `0x${string}`;
    args: string[];
    functionName: "get_evaluation_reason" | "get_status" | "get_verdict";
    transactionHashVariant: TransactionHashVariant;
  }): Promise<unknown>;
}

export type FinalizedAttestationImport = {
  caseFile: GenLayerAttestationRequest["caseFile"];
  publicCaseFileUrl: string;
  transactionHash: string;
};

type SubmittedAdjudication = {
  caseCommitment: string;
  publicCaseFileUrl: string;
};

function parseSubmittedAdjudication(calldata: string): SubmittedAdjudication {
  const match =
    /""\s*:\s*"adjudicate"\s*,?\s*"args"\s*:\s*\[\s*"([^"\\]+)"\s*,\s*"([^"\\]+)"\s*,?\s*\]/.exec(
      calldata,
    );

  if (!match) {
    throw new StudioDevAttestationVerificationError(
      "The transaction is not a readable adjudicate call.",
    );
  }

  const [, caseCommitment, publicCaseFileUrl] = match;
  if (!caseCommitment || !publicCaseFileUrl) {
    throw new StudioDevAttestationVerificationError(
      "The transaction does not contain complete adjudicate arguments.",
    );
  }

  return { caseCommitment, publicCaseFileUrl };
}

function parseViewResult(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new StudioDevAttestationVerificationError(
      `The configured contract ${field} view did not return a string result.`,
    );
  }

  return value;
}

export class StudioDevAttestationVerifier {
  constructor(
    private readonly client: StudioDevReadClient,
    private readonly contractAddress: string,
  ) {
    addressSchema.parse(contractAddress);
  }

  async importFinalized(submission: FinalizedAttestationImport): Promise<AttestationReceipt> {
    const transactionHash = transactionHashSchema.parse(submission.transactionHash);
    const transaction = studioTransactionSchema.parse(
      await this.client.getTransaction({ hash: transactionHash }),
    );

    if (transaction.to_address.toLowerCase() !== this.contractAddress.toLowerCase()) {
      throw new StudioDevAttestationVerificationError(
        "The transaction targets a different GenLayer contract.",
      );
    }

    const submitted = parseSubmittedAdjudication(transaction.data.calldata.readable);
    if (submitted.caseCommitment !== submission.caseFile.caseCommitment) {
      throw new StudioDevAttestationVerificationError(
        "The transaction case commitment does not match the Hollis case.",
      );
    }
    if (submitted.publicCaseFileUrl !== submission.publicCaseFileUrl) {
      throw new StudioDevAttestationVerificationError(
        "The transaction case-file URL does not match the submitted Hollis case file.",
      );
    }

    const [status, verdict, evaluationReason] = await Promise.all([
      this.read("get_status", submitted.caseCommitment),
      this.read("get_verdict", submitted.caseCommitment),
      this.read("get_evaluation_reason", submitted.caseCommitment),
    ]);

    if (status !== "finalized") {
      throw new StudioDevAttestationVerificationError(
        "The configured contract case result is not finalized.",
      );
    }
    if (evaluationReason === "not_found") {
      throw new StudioDevAttestationVerificationError(
        "The configured contract has no result for the submitted case commitment.",
      );
    }

    return attestationReceiptSchema.parse({
      contractAddress: this.contractAddress,
      provider: "genlayer",
      providerSubmissionId: transactionHash,
      status,
      transactionHash,
      verdict,
    });
  }

  async assertRepresentativeState(): Promise<void> {
    const [passStatus, passVerdict, passReason, failStatus, failVerdict, failReason] =
      await Promise.all([
        this.read("get_status", representativePassCommitment),
        this.read("get_verdict", representativePassCommitment),
        this.read("get_evaluation_reason", representativePassCommitment),
        this.read("get_status", representativeFailCommitment),
        this.read("get_verdict", representativeFailCommitment),
        this.read("get_evaluation_reason", representativeFailCommitment),
      ]);

    if (
      passStatus !== "finalized" ||
      passVerdict !== "pass" ||
      passReason !== "requirements_satisfied" ||
      failStatus !== "finalized" ||
      failVerdict !== "fail" ||
      failReason !== "human_decision_missing"
    ) {
      throw new StudioDevAttestationVerificationError(
        "The configured contract has not retained the required representative pass and fail results.",
      );
    }
  }

  private async read(
    functionName: "get_evaluation_reason" | "get_status" | "get_verdict",
    caseCommitment: string,
  ): Promise<string> {
    return parseViewResult(
      await this.client.readContract({
        address: this.contractAddress as `0x${string}`,
        args: [caseCommitment],
        functionName,
        transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
      }),
      functionName,
    );
  }
}

export function createStudioDevAttestationVerifier(
  contractAddress: string,
  rpcUrl: string,
): StudioDevAttestationVerifier {
  const client = createClient({ chain: studioDevnet, endpoint: rpcUrl });
  return new StudioDevAttestationVerifier(
    {
      getTransaction: ({ hash }) => client.getTransaction({ hash: hash as unknown as Hash }),
      readContract: ({ address, args, functionName, transactionHashVariant }) =>
        client.readContract({ address, args, functionName, transactionHashVariant }),
    },
    contractAddress,
  );
}
