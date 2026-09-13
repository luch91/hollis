import {
  attestationReceiptSchema,
  attestationVerdictSchema,
  managedAttestationSubmissionSchema,
  type AttestationReceipt,
  type GenLayerAttestationRequest,
  type ManagedAttestationSubmission,
  type PolicyContractDeployment,
} from "@hollis/contracts";
import { digestPolicyContractValue } from "./policy-contract-deployment.js";

export type ReserveManagedAttestationSubmission = {
  caseCommitment: string;
  caseId: string;
  contractAddress: string;
  deploymentId: string;
  idempotencyKey: string;
  publicCaseFileUrl: string;
  runtimeAddress: string;
  tenantId: string;
};

export interface ManagedAttestationSubmissionStore {
  find(tenantId: string, submissionId: string): Promise<ManagedAttestationSubmission | null>;
  markFailed(
    tenantId: string,
    submissionId: string,
    status: "failed" | "reconciliation_required",
    failureCode: string,
  ): Promise<ManagedAttestationSubmission>;
  markFinalized(
    tenantId: string,
    submissionId: string,
    result: {
      evaluationReason: string;
      verdict: "pass" | "fail" | "needs_review" | "undetermined";
    },
  ): Promise<ManagedAttestationSubmission>;
  markSubmitted(
    tenantId: string,
    submissionId: string,
    transactionHash: string,
  ): Promise<ManagedAttestationSubmission>;
  markSubmitting(
    tenantId: string,
    submissionId: string,
  ): Promise<ManagedAttestationSubmission | null>;
  reserve(input: ReserveManagedAttestationSubmission): Promise<ManagedAttestationSubmission>;
}

export interface ManagedAttestationClient {
  readResult(input: { caseCommitment: string; contractAddress: string }): Promise<{
    evaluationReason: string;
    status: string;
    verdict: string;
  }>;
  submit(input: {
    caseCommitment: string;
    contractAddress: string;
    publicCaseFileUrl: string;
  }): Promise<string>;
  waitForFinalization(transactionHash: string): Promise<{ executionSucceeded: boolean }>;
}

export class ManagedAttestationSubmissionError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "ManagedAttestationSubmissionError";
  }
}

async function requireSubmission(
  store: ManagedAttestationSubmissionStore,
  tenantId: string,
  submissionId: string,
): Promise<ManagedAttestationSubmission> {
  const submission = await store.find(tenantId, submissionId);
  if (!submission) {
    throw new ManagedAttestationSubmissionError(
      "The managed attestation submission no longer exists.",
      "submission_not_found",
    );
  }
  return managedAttestationSubmissionSchema.parse(submission);
}

export async function ensureManagedAttestationSubmission(input: {
  client: ManagedAttestationClient;
  deployment: PolicyContractDeployment;
  request: GenLayerAttestationRequest;
  caseId: string;
  store: ManagedAttestationSubmissionStore;
  tenantId: string;
}): Promise<{ receipt: AttestationReceipt; submission: ManagedAttestationSubmission }> {
  if (input.deployment.status !== "active" || !input.deployment.contractAddress) {
    throw new ManagedAttestationSubmissionError(
      "The selected policy control has no active verified GenLayer contract.",
      "active_policy_contract_required",
    );
  }
  if (input.deployment.tenantId !== input.tenantId) {
    throw new ManagedAttestationSubmissionError(
      "The policy contract belongs to another workspace.",
      "policy_contract_tenant_mismatch",
    );
  }
  if (input.deployment.bindingDigest !== digestPolicyContractValue(input.request.caseFile.policy)) {
    throw new ManagedAttestationSubmissionError(
      "The case policy binding does not match the active GenLayer contract.",
      "policy_contract_binding_mismatch",
    );
  }

  let submission = managedAttestationSubmissionSchema.parse(
    await input.store.reserve({
      caseCommitment: input.request.caseFile.caseCommitment,
      caseId: input.caseId,
      contractAddress: input.deployment.contractAddress,
      deploymentId: input.deployment.id,
      idempotencyKey: input.request.idempotencyKey,
      publicCaseFileUrl: input.request.publicCaseFileUrl,
      runtimeAddress: input.deployment.runtimeAddress,
      tenantId: input.tenantId,
    }),
  );

  if (
    submission.caseId !== input.caseId ||
    submission.caseCommitment !== input.request.caseFile.caseCommitment ||
    submission.deploymentId !== input.deployment.id ||
    submission.contractAddress.toLowerCase() !== input.deployment.contractAddress.toLowerCase() ||
    submission.publicCaseFileUrl !== input.request.publicCaseFileUrl
  ) {
    throw new ManagedAttestationSubmissionError(
      "The attestation idempotency key is already bound to different submission facts.",
      "attestation_idempotency_conflict",
    );
  }

  if (submission.status === "failed" || submission.status === "reconciliation_required") {
    throw new ManagedAttestationSubmissionError(
      "The existing attestation submission requires operator reconciliation.",
      submission.failureCode ?? "attestation_submission_failed",
    );
  }
  if (submission.status === "submitting") {
    throw new ManagedAttestationSubmissionError(
      "The attestation transaction outcome is not recorded and must be reconciled.",
      "attestation_submission_uncertain",
    );
  }

  if (submission.status === "pending") {
    const claimed = await input.store.markSubmitting(input.tenantId, submission.id);
    if (!claimed) {
      submission = await requireSubmission(input.store, input.tenantId, submission.id);
      if (submission.status === "submitting") {
        throw new ManagedAttestationSubmissionError(
          "Another worker is submitting this attestation.",
          "attestation_submission_in_progress",
        );
      }
    } else {
      try {
        const transactionHash = await input.client.submit({
          caseCommitment: submission.caseCommitment,
          contractAddress: submission.contractAddress,
          publicCaseFileUrl: submission.publicCaseFileUrl,
        });
        submission = await input.store.markSubmitted(
          input.tenantId,
          submission.id,
          transactionHash,
        );
      } catch {
        await input.store.markFailed(
          input.tenantId,
          submission.id,
          "reconciliation_required",
          "attestation_submission_uncertain",
        );
        throw new ManagedAttestationSubmissionError(
          "The attestation submission outcome is uncertain and automatic retry is disabled.",
          "attestation_submission_uncertain",
        );
      }
    }
  }

  if (submission.status === "submitted") {
    if (!submission.transactionHash) {
      throw new ManagedAttestationSubmissionError(
        "The submitted attestation is missing its transaction hash.",
        "attestation_transaction_missing",
      );
    }
    const finalized = await input.client.waitForFinalization(submission.transactionHash);
    if (!finalized.executionSucceeded) {
      await input.store.markFailed(
        input.tenantId,
        submission.id,
        "failed",
        "attestation_execution_failed",
      );
      throw new ManagedAttestationSubmissionError(
        "The GenLayer adjudication finalized without successful execution.",
        "attestation_execution_failed",
      );
    }
    const result = await input.client.readResult({
      caseCommitment: submission.caseCommitment,
      contractAddress: submission.contractAddress,
    });
    if (result.status !== "finalized") {
      await input.store.markFailed(
        input.tenantId,
        submission.id,
        "failed",
        "attestation_result_not_finalized",
      );
      throw new ManagedAttestationSubmissionError(
        "The contract did not retain a finalized result for the case.",
        "attestation_result_not_finalized",
      );
    }
    const verdict = attestationVerdictSchema.parse(result.verdict);
    const receipt = attestationReceiptSchema.parse({
      contractAddress: submission.contractAddress,
      provider: "genlayer",
      providerSubmissionId: submission.transactionHash,
      status: result.status,
      transactionHash: submission.transactionHash,
      verdict,
    });
    submission = await input.store.markFinalized(input.tenantId, submission.id, {
      evaluationReason: result.evaluationReason,
      verdict,
    });
  }

  if (submission.status !== "finalized" || !submission.transactionHash || !submission.verdict) {
    throw new ManagedAttestationSubmissionError(
      "The managed attestation did not reach a finalized state.",
      "attestation_not_finalized",
    );
  }

  return {
    receipt: attestationReceiptSchema.parse({
      contractAddress: submission.contractAddress,
      provider: "genlayer",
      providerSubmissionId: submission.transactionHash,
      status: "finalized",
      transactionHash: submission.transactionHash,
      verdict: submission.verdict,
    }),
    submission,
  };
}
