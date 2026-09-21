import { createHash } from "node:crypto";
import {
  type PolicyContractBinding,
  type PolicyContractDeployment,
  policyContractBindingSchema,
  policyContractDeploymentSchema,
} from "@hollis/contracts";

const terminalFailureStatuses = new Set(["failed", "binding_mismatch"]);

export type ReservePolicyContractDeployment = {
  binding: PolicyContractBinding;
  bindingDigest: string;
  createdByUserId: string;
  network: "studio-dev" | "studio-next";
  networkChainId: 61997;
  policyControlRecordId: string;
  runtimeAddress: string;
  sourceDigest: string;
  sourceVersion: string;
  tenantId: string;
};

export interface PolicyContractDeploymentStore {
  findByPolicyControl(
    tenantId: string,
    policyControlRecordId: string,
  ): Promise<PolicyContractDeployment | null>;
  activate(tenantId: string, deploymentId: string): Promise<PolicyContractDeployment>;
  find(tenantId: string, deploymentId: string): Promise<PolicyContractDeployment | null>;
  markFailed(
    tenantId: string,
    deploymentId: string,
    status: "failed" | "binding_mismatch",
    failureCode: string,
  ): Promise<PolicyContractDeployment>;
  markFinalized(
    tenantId: string,
    deploymentId: string,
    contractAddress: string,
  ): Promise<PolicyContractDeployment>;
  markSubmitted(
    tenantId: string,
    deploymentId: string,
    transactionHash: string,
  ): Promise<PolicyContractDeployment>;
  markSubmitting(tenantId: string, deploymentId: string): Promise<PolicyContractDeployment | null>;
  markVerified(tenantId: string, deploymentId: string): Promise<PolicyContractDeployment>;
  reserve(input: ReservePolicyContractDeployment): Promise<PolicyContractDeployment>;
}

export interface PolicyContractDeploymentClient {
  deploy(input: {
    binding: PolicyContractBinding;
    runtimeAddress: string;
    source: string;
  }): Promise<string>;
  probeFinalization?(
    transactionHash: string,
  ): Promise<{ contractAddress: string | null; executionSucceeded: boolean } | null>;
  readBinding(contractAddress: string): Promise<unknown>;
  readRuntimeAddress?(contractAddress: string): Promise<string>;
  waitForFinalization(transactionHash: string): Promise<{
    contractAddress: string | null;
    executionSucceeded: boolean;
  }>;
}

/**
 * Broadcasts a policy-bound deployment exactly once. Finalization is reconciled
 * separately so an HTTP request never has to remain open while GenLayer reaches
 * consensus.
 */
export async function beginPolicyContractDeployment(input: {
  binding: PolicyContractBinding;
  client: PolicyContractDeploymentClient;
  createdByUserId: string;
  policyControlRecordId: string;
  runtimeAddress: string;
  source: string;
  sourceVersion: string;
  store: PolicyContractDeploymentStore;
  tenantId: string;
}): Promise<PolicyContractDeployment> {
  const binding = policyContractBindingSchema.parse(input.binding);
  const bindingDigest = digestPolicyContractValue(binding);
  const sourceDigest = digestPolicyContractSource(input.source);
  let deployment = policyContractDeploymentSchema.parse(
    await input.store.reserve({
      binding,
      bindingDigest,
      createdByUserId: input.createdByUserId,
      network: "studio-next",
      networkChainId: 61997,
      policyControlRecordId: input.policyControlRecordId,
      runtimeAddress: input.runtimeAddress,
      sourceDigest,
      sourceVersion: input.sourceVersion,
      tenantId: input.tenantId,
    }),
  );

  if (terminalFailureStatuses.has(deployment.status)) {
    throw new PolicyContractDeploymentError(
      "The existing policy contract deployment requires operator reconciliation.",
      deployment.failureCode ?? "deployment_failed",
    );
  }
  if (deployment.status === "active" || deployment.status === "submitted") return deployment;
  if (deployment.status === "submitting") {
    throw new PolicyContractDeploymentError(
      "The deployment submission outcome is not yet recorded and must be reconciled before retrying.",
      "deployment_submission_uncertain",
    );
  }
  if (deployment.status !== "pending") return deployment;

  const claimed = await input.store.markSubmitting(input.tenantId, deployment.id);
  if (!claimed) {
    deployment = await requireDeployment(input.store, input.tenantId, deployment.id);
    return deployment;
  }
  try {
    const transactionHash = await input.client.deploy({
      binding,
      runtimeAddress: input.runtimeAddress,
      source: input.source,
    });
    return await input.store.markSubmitted(input.tenantId, deployment.id, transactionHash);
  } catch {
    await input.store.markFailed(
      input.tenantId,
      deployment.id,
      "failed",
      "deployment_submission_uncertain",
    );
    throw new PolicyContractDeploymentError(
      "The deployment submission outcome is uncertain and automatic retry is disabled.",
      "deployment_submission_uncertain",
    );
  }
}

/**
 * Performs one bounded reconciliation attempt. A pending consensus result is
 * retained as submitted and can be reconciled safely by a later request.
 */
export async function reconcilePolicyContractDeployment(input: {
  client: PolicyContractDeploymentClient;
  deployment: PolicyContractDeployment;
  store: PolicyContractDeploymentStore;
  tenantId: string;
}): Promise<PolicyContractDeployment> {
  let deployment = policyContractDeploymentSchema.parse(input.deployment);
  if (deployment.tenantId !== input.tenantId) {
    throw new PolicyContractDeploymentError(
      "The policy contract deployment belongs to another workspace.",
      "deployment_tenant_mismatch",
    );
  }
  if (terminalFailureStatuses.has(deployment.status) || deployment.status === "active")
    return deployment;
  if (deployment.status === "submitted") {
    if (!deployment.deploymentTransactionHash) {
      throw new PolicyContractDeploymentError(
        "The submitted deployment is missing its transaction hash.",
        "deployment_transaction_missing",
      );
    }
    const finalized = input.client.probeFinalization
      ? await input.client.probeFinalization(deployment.deploymentTransactionHash)
      : null;
    if (!finalized) return deployment;
    if (!finalized.executionSucceeded || !finalized.contractAddress) {
      return input.store.markFailed(
        input.tenantId,
        deployment.id,
        "failed",
        "deployment_execution_failed",
      );
    }
    deployment = await input.store.markFinalized(
      input.tenantId,
      deployment.id,
      finalized.contractAddress,
    );
  }
  if (deployment.status === "finalized") {
    if (!deployment.contractAddress) {
      return input.store.markFailed(
        input.tenantId,
        deployment.id,
        "failed",
        "deployment_contract_missing",
      );
    }
    const actualBinding = policyContractBindingSchema.parse(
      await input.client.readBinding(deployment.contractAddress),
    );
    if (digestPolicyContractValue(actualBinding) !== deployment.bindingDigest) {
      return input.store.markFailed(
        input.tenantId,
        deployment.id,
        "binding_mismatch",
        "policy_binding_mismatch",
      );
    }
    if (deployment.sourceVersion === "v8") {
      if (!input.client.readRuntimeAddress) {
        return input.store.markFailed(
          input.tenantId,
          deployment.id,
          "binding_mismatch",
          "runtime_authorization_unverifiable",
        );
      }
      const runtimeAddress = await input.client.readRuntimeAddress(deployment.contractAddress);
      if (runtimeAddress.toLowerCase() !== deployment.runtimeAddress.toLowerCase()) {
        return input.store.markFailed(
          input.tenantId,
          deployment.id,
          "binding_mismatch",
          "runtime_authorization_mismatch",
        );
      }
    }
    deployment = await input.store.markVerified(input.tenantId, deployment.id);
  }
  if (deployment.status === "verified") {
    deployment = await input.store.activate(input.tenantId, deployment.id);
  }
  return deployment;
}

export class PolicyContractDeploymentError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "PolicyContractDeploymentError";
  }
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(",")}}`;
}

export function digestPolicyContractValue(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalize(value)).digest("hex")}`;
}

export function digestPolicyContractSource(source: string): string {
  return `sha256:${createHash("sha256").update(source).digest("hex")}`;
}

export function policyContractConstructorArguments(
  binding: PolicyContractBinding,
  runtimeAddress: string,
): string[] {
  const parsed = policyContractBindingSchema.parse(binding);
  return [
    parsed.policyId,
    parsed.policyVersion,
    parsed.control.controlId,
    parsed.control.controlVersion,
    parsed.control.policyDocumentDigest,
    parsed.control.attestationCriterion,
    parsed.control.evidenceRequirement,
    parsed.control.interpretation,
    runtimeAddress,
  ];
}

async function requireDeployment(
  store: PolicyContractDeploymentStore,
  tenantId: string,
  deploymentId: string,
): Promise<PolicyContractDeployment> {
  const deployment = await store.find(tenantId, deploymentId);
  if (!deployment) {
    throw new PolicyContractDeploymentError(
      "The policy contract deployment record no longer exists.",
      "deployment_not_found",
    );
  }
  return policyContractDeploymentSchema.parse(deployment);
}

export async function ensurePolicyContractDeployment(input: {
  binding: PolicyContractBinding;
  client: PolicyContractDeploymentClient;
  createdByUserId: string;
  policyControlRecordId: string;
  runtimeAddress: string;
  source: string;
  sourceVersion: string;
  store: PolicyContractDeploymentStore;
  tenantId: string;
}): Promise<PolicyContractDeployment> {
  const binding = policyContractBindingSchema.parse(input.binding);
  const bindingDigest = digestPolicyContractValue(binding);
  const sourceDigest = digestPolicyContractSource(input.source);
  let deployment = policyContractDeploymentSchema.parse(
    await input.store.reserve({
      binding,
      bindingDigest,
      createdByUserId: input.createdByUserId,
      network: "studio-next",
      networkChainId: 61997,
      policyControlRecordId: input.policyControlRecordId,
      runtimeAddress: input.runtimeAddress,
      sourceDigest,
      sourceVersion: input.sourceVersion,
      tenantId: input.tenantId,
    }),
  );

  if (terminalFailureStatuses.has(deployment.status)) {
    throw new PolicyContractDeploymentError(
      "The existing policy contract deployment requires operator reconciliation.",
      deployment.failureCode ?? "deployment_failed",
    );
  }
  if (deployment.status === "submitting") {
    throw new PolicyContractDeploymentError(
      "The deployment submission outcome is not yet recorded and must be reconciled before retrying.",
      "deployment_submission_uncertain",
    );
  }
  if (deployment.status === "active") return deployment;

  if (deployment.status === "pending") {
    const claimed = await input.store.markSubmitting(input.tenantId, deployment.id);
    if (!claimed) {
      deployment = await requireDeployment(input.store, input.tenantId, deployment.id);
      if (deployment.status === "submitting") {
        throw new PolicyContractDeploymentError(
          "Another worker is submitting this policy contract deployment.",
          "deployment_in_progress",
        );
      }
    } else {
      try {
        const transactionHash = await input.client.deploy({
          binding,
          runtimeAddress: input.runtimeAddress,
          source: input.source,
        });
        deployment = await input.store.markSubmitted(
          input.tenantId,
          deployment.id,
          transactionHash,
        );
      } catch {
        await input.store.markFailed(
          input.tenantId,
          deployment.id,
          "failed",
          "deployment_submission_uncertain",
        );
        throw new PolicyContractDeploymentError(
          "The deployment submission outcome is uncertain and automatic retry is disabled.",
          "deployment_submission_uncertain",
        );
      }
    }
  }

  if (deployment.status === "submitted") {
    if (!deployment.deploymentTransactionHash) {
      throw new PolicyContractDeploymentError(
        "The submitted deployment is missing its transaction hash.",
        "deployment_transaction_missing",
      );
    }
    const finalized = await input.client.waitForFinalization(deployment.deploymentTransactionHash);
    if (!finalized.executionSucceeded || !finalized.contractAddress) {
      await input.store.markFailed(
        input.tenantId,
        deployment.id,
        "failed",
        "deployment_execution_failed",
      );
      throw new PolicyContractDeploymentError(
        "The policy contract deployment finalized without successful execution.",
        "deployment_execution_failed",
      );
    }
    deployment = await input.store.markFinalized(
      input.tenantId,
      deployment.id,
      finalized.contractAddress,
    );
  }

  if (deployment.status === "finalized") {
    if (!deployment.contractAddress) {
      throw new PolicyContractDeploymentError(
        "The finalized deployment is missing its contract address.",
        "deployment_contract_missing",
      );
    }
    const actualBinding = policyContractBindingSchema.parse(
      await input.client.readBinding(deployment.contractAddress),
    );
    if (digestPolicyContractValue(actualBinding) !== deployment.bindingDigest) {
      await input.store.markFailed(
        input.tenantId,
        deployment.id,
        "binding_mismatch",
        "policy_binding_mismatch",
      );
      throw new PolicyContractDeploymentError(
        "The deployed contract binding does not match the published policy control.",
        "policy_binding_mismatch",
      );
    }
    if (deployment.sourceVersion === "v8") {
      if (!input.client.readRuntimeAddress) {
        await input.store.markFailed(
          input.tenantId,
          deployment.id,
          "binding_mismatch",
          "runtime_authorization_unverifiable",
        );
        throw new PolicyContractDeploymentError(
          "The deployment cannot verify its authorized runtime account.",
          "runtime_authorization_unverifiable",
        );
      }
      const runtimeAddress = await input.client.readRuntimeAddress(deployment.contractAddress);
      if (runtimeAddress.toLowerCase() !== deployment.runtimeAddress.toLowerCase()) {
        await input.store.markFailed(
          input.tenantId,
          deployment.id,
          "binding_mismatch",
          "runtime_authorization_mismatch",
        );
        throw new PolicyContractDeploymentError(
          "The deployed contract runtime authorization differs from its immutable deployment record.",
          "runtime_authorization_mismatch",
        );
      }
    }
    deployment = await input.store.markVerified(input.tenantId, deployment.id);
  }

  if (deployment.status === "verified") {
    deployment = await input.store.activate(input.tenantId, deployment.id);
  }

  if (deployment.status !== "active") {
    throw new PolicyContractDeploymentError(
      "The policy contract deployment did not reach an active state.",
      "deployment_not_active",
    );
  }
  return deployment;
}
