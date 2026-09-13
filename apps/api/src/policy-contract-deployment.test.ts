import { randomUUID } from "node:crypto";
import type {
  PolicyContractBinding,
  PolicyContractDeployment,
  PolicyContractDeploymentStatus,
} from "@hollis/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  digestPolicyContractValue,
  digestPolicyContractSource,
  ensurePolicyContractDeployment,
  type PolicyContractDeploymentClient,
  type PolicyContractDeploymentStore,
  policyContractConstructorArguments,
  type PolicyContractDeploymentError,
  type ReservePolicyContractDeployment,
} from "./policy-contract-deployment.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const controlRecordId = "33333333-3333-4333-8333-333333333333";
const runtimeAddress = `0x${"4".repeat(40)}`;
const contractAddress = `0x${"5".repeat(40)}`;
const transactionHash = `0x${"6".repeat(64)}`;
const source = "# v0.3.0\nclass PolicyProcessAttestationV7: pass";

const binding: PolicyContractBinding = {
  control: {
    attestationCriterion: "A human decision must be recorded.",
    controlId: "human-review-required",
    controlVersion: "1.0",
    evidenceRequirement: "verified_reference_required",
    interpretation: "deterministic",
    policyDocumentDigest: `sha256:${"7".repeat(64)}`,
  },
  policyId: "governance-policy",
  policyVersion: "2026.1",
};

class MemoryStore implements PolicyContractDeploymentStore {
  record: PolicyContractDeployment | null = null;

  async findByPolicyControl() {
    return this.record;
  }

  async reserve(input: ReservePolicyContractDeployment) {
    if (this.record) return this.record;
    const now = new Date().toISOString();
    this.record = {
      activatedAt: null,
      binding: input.binding,
      bindingDigest: input.bindingDigest,
      contractAddress: null,
      createdAt: now,
      createdByUserId: input.createdByUserId,
      deploymentTransactionHash: null,
      failureCode: null,
      finalizedAt: null,
      id: randomUUID(),
      network: input.network,
      networkChainId: input.networkChainId,
      policyControlRecordId: input.policyControlRecordId,
      runtimeAddress: input.runtimeAddress,
      sourceDigest: input.sourceDigest,
      sourceVersion: input.sourceVersion,
      status: "pending",
      tenantId: input.tenantId,
      updatedAt: now,
      verifiedAt: null,
    };
    return this.record;
  }

  async find(_tenantId: string, _deploymentId: string) {
    return this.record;
  }

  async markSubmitting(_tenantId: string, _deploymentId: string) {
    if (this.record?.status !== "pending") return null;
    return this.update({ status: "submitting" });
  }

  async markSubmitted(_tenantId: string, _deploymentId: string, hash: string) {
    return this.update({ deploymentTransactionHash: hash, status: "submitted" });
  }

  async markFinalized(_tenantId: string, _deploymentId: string, address: string) {
    const now = new Date().toISOString();
    return this.update({ contractAddress: address, finalizedAt: now, status: "finalized" });
  }

  async markVerified(_tenantId: string, _deploymentId: string) {
    return this.update({ status: "verified", verifiedAt: new Date().toISOString() });
  }

  async activate(_tenantId: string, _deploymentId: string) {
    return this.update({ activatedAt: new Date().toISOString(), status: "active" });
  }

  async markFailed(
    _tenantId: string,
    _deploymentId: string,
    status: "failed" | "binding_mismatch",
    failureCode: string,
  ) {
    return this.update({ failureCode, status });
  }

  private update(
    values: Partial<PolicyContractDeployment> & { status: PolicyContractDeploymentStatus },
  ) {
    if (!this.record) throw new Error("Missing deployment record.");
    this.record = { ...this.record, ...values, updatedAt: new Date().toISOString() };
    return this.record;
  }
}

function client(overrides: Partial<PolicyContractDeploymentClient> = {}) {
  return {
    deploy: vi.fn(async () => transactionHash),
    readBinding: vi.fn(async () => binding),
    waitForFinalization: vi.fn(async () => ({ contractAddress, executionSucceeded: true })),
    ...overrides,
  } satisfies PolicyContractDeploymentClient;
}

function deploy(store: MemoryStore, deploymentClient: PolicyContractDeploymentClient) {
  return ensurePolicyContractDeployment({
    binding,
    client: deploymentClient,
    createdByUserId: actorId,
    policyControlRecordId: controlRecordId,
    runtimeAddress,
    source,
    sourceVersion: "v7",
    store,
    tenantId,
  });
}

describe("policy contract deployment", () => {
  it("maps the immutable binding to the V7 constructor order", () => {
    expect(policyContractConstructorArguments(binding)).toEqual([
      "governance-policy",
      "2026.1",
      "human-review-required",
      "1.0",
      `sha256:${"7".repeat(64)}`,
      "A human decision must be recorded.",
      "verified_reference_required",
      "deterministic",
    ]);
  });

  it("deploys, verifies the immutable binding, and activates once", async () => {
    const store = new MemoryStore();
    const deploymentClient = client();
    const first = await deploy(store, deploymentClient);
    const second = await deploy(store, deploymentClient);

    expect(first.status).toBe("active");
    expect(second.id).toBe(first.id);
    expect(deploymentClient.deploy).toHaveBeenCalledTimes(1);
    expect(deploymentClient.waitForFinalization).toHaveBeenCalledWith(transactionHash);
    expect(first.bindingDigest).toBe(digestPolicyContractValue(binding));
  });

  it("resumes a submitted transaction without deploying another contract", async () => {
    const store = new MemoryStore();
    await store.reserve({
      binding,
      bindingDigest: digestPolicyContractValue(binding),
      createdByUserId: actorId,
      network: "studio-dev",
      networkChainId: 61997,
      policyControlRecordId: controlRecordId,
      runtimeAddress,
      sourceDigest: digestPolicyContractSource(source),
      sourceVersion: "v7",
      tenantId,
    });
    const deploymentId = store.record?.id;
    if (!deploymentId) throw new Error("The deployment was not reserved.");
    await store.markSubmitting(tenantId, deploymentId);
    await store.markSubmitted(tenantId, deploymentId, transactionHash);
    const deploymentClient = client();

    const result = await deploy(store, deploymentClient);

    expect(result.status).toBe("active");
    expect(deploymentClient.deploy).not.toHaveBeenCalled();
  });

  it("blocks activation when the deployed binding differs", async () => {
    const store = new MemoryStore();
    const deploymentClient = client({
      readBinding: vi.fn(async () => ({ ...binding, policyVersion: "wrong" })),
    });

    await expect(deploy(store, deploymentClient)).rejects.toMatchObject({
      code: "policy_binding_mismatch",
    } satisfies Partial<PolicyContractDeploymentError>);
    expect(store.record).toMatchObject({
      failureCode: "policy_binding_mismatch",
      status: "binding_mismatch",
    });
  });

  it("does not automatically retry an uncertain submission", async () => {
    const store = new MemoryStore();
    const firstClient = client({ deploy: vi.fn(async () => Promise.reject(new Error("timeout"))) });
    await expect(deploy(store, firstClient)).rejects.toMatchObject({
      code: "deployment_submission_uncertain",
    });
    const secondClient = client();

    await expect(deploy(store, secondClient)).rejects.toMatchObject({
      code: "deployment_submission_uncertain",
    });
    expect(secondClient.deploy).not.toHaveBeenCalled();
  });
});
