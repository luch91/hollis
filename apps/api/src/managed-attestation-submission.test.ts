import { randomUUID } from "node:crypto";
import type {
  GenLayerAttestationRequest,
  ManagedAttestationSubmission,
  ManagedAttestationSubmissionStatus,
  PolicyContractDeployment,
} from "@hollis/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  ensureManagedAttestationSubmission,
  type ManagedAttestationClient,
  type ManagedAttestationSubmissionStore,
  type ReserveManagedAttestationSubmission,
} from "./managed-attestation-submission.js";
import { digestPolicyContractValue } from "./policy-contract-deployment.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const transactionHash = `0x${"3".repeat(64)}`;
const contractAddress = `0x${"4".repeat(40)}`;
const runtimeAddress = `0x${"5".repeat(40)}`;
const commitment = `sha256:${"6".repeat(64)}`;
const idempotencyKey = `sha256:${"7".repeat(64)}`;
const publicCaseFileUrl = "https://api.hollis.test/v1/public/attestation-case-files/case";

const request = {
  caseFile: {
    auditManifestHash: commitment,
    caseCommitment: commitment,
    evidence: [{ digest: `sha256:${"8".repeat(64)}`, mediaType: "text/plain", verified: true }],
    policy: {
      control: {
        attestationCriterion: "A human decision must be recorded.",
        controlId: "human-review-required",
        controlVersion: "1.0",
        evidenceRequirement: "verified_reference_required",
        interpretation: "deterministic",
        policyDocumentDigest: `sha256:${"9".repeat(64)}`,
      },
      policyId: "governance-policy",
      policyVersion: "2026.1",
    },
    review: {
      decisionRecorded: true,
      escalationRecorded: false,
      humanDecisionOutcome: "approved",
      reviewerActionCommitment: `sha256:${"a".repeat(64)}`,
    },
    schemaVersion: "hollis.adjudication-case.v1",
  },
  idempotencyKey,
  publicCaseFileUrl,
} satisfies GenLayerAttestationRequest;

const now = new Date().toISOString();
const deployment = {
  activatedAt: now,
  binding: request.caseFile.policy,
  bindingDigest: digestPolicyContractValue(request.caseFile.policy),
  contractAddress,
  createdAt: now,
  createdByUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  deploymentTransactionHash: `0x${"b".repeat(64)}`,
  failureCode: null,
  finalizedAt: now,
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  network: "studio-dev",
  networkChainId: 61997,
  policyControlRecordId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  runtimeAddress,
  sourceDigest: `sha256:${"c".repeat(64)}`,
  sourceVersion: "v7",
  status: "active",
  tenantId,
  updatedAt: now,
  verifiedAt: now,
} satisfies PolicyContractDeployment;

class MemoryStore implements ManagedAttestationSubmissionStore {
  record: ManagedAttestationSubmission | null = null;

  async reserve(input: ReserveManagedAttestationSubmission) {
    if (this.record) return this.record;
    this.record = {
      ...input,
      createdAt: now,
      evaluationReason: null,
      failureCode: null,
      finalizedAt: null,
      id: randomUUID(),
      status: "pending",
      transactionHash: null,
      updatedAt: now,
      verdict: null,
    };
    return this.record;
  }

  async find(_tenantId: string, _submissionId: string) {
    return this.record;
  }

  async markSubmitting(_tenantId: string, _submissionId: string) {
    if (this.record?.status !== "pending") return null;
    return this.update({ status: "submitting" });
  }

  async markSubmitted(_tenantId: string, _submissionId: string, hash: string) {
    return this.update({ status: "submitted", transactionHash: hash });
  }

  async markFinalized(
    _tenantId: string,
    _submissionId: string,
    result: {
      evaluationReason: string;
      verdict: "pass" | "fail" | "needs_review" | "undetermined";
    },
  ) {
    return this.update({ ...result, finalizedAt: now, status: "finalized" });
  }

  async markFailed(
    _tenantId: string,
    _submissionId: string,
    status: "failed" | "reconciliation_required",
    failureCode: string,
  ) {
    return this.update({ failureCode, status });
  }

  private update(
    values: Partial<ManagedAttestationSubmission> & { status: ManagedAttestationSubmissionStatus },
  ) {
    if (!this.record) throw new Error("Missing submission record.");
    this.record = { ...this.record, ...values, updatedAt: new Date().toISOString() };
    return this.record;
  }
}

function client(overrides: Partial<ManagedAttestationClient> = {}) {
  return {
    readResult: vi.fn(async () => ({
      evaluationReason: "requirements_satisfied",
      status: "finalized",
      verdict: "pass",
    })),
    submit: vi.fn(async () => transactionHash),
    waitForFinalization: vi.fn(async () => ({ executionSucceeded: true })),
    ...overrides,
  } satisfies ManagedAttestationClient;
}

function submit(store: MemoryStore, submissionClient: ManagedAttestationClient) {
  return ensureManagedAttestationSubmission({
    caseId,
    client: submissionClient,
    deployment,
    request,
    store,
    tenantId,
  });
}

describe("managed GenLayer attestation submission", () => {
  it("submits once, waits for finality, and records the contract result", async () => {
    const store = new MemoryStore();
    const submissionClient = client();

    const first = await submit(store, submissionClient);
    const second = await submit(store, submissionClient);

    expect(first.receipt).toMatchObject({ status: "finalized", verdict: "pass" });
    expect(first.submission.evaluationReason).toBe("requirements_satisfied");
    expect(second.submission.id).toBe(first.submission.id);
    expect(submissionClient.submit).toHaveBeenCalledTimes(1);
  });

  it("resumes from an already-recorded transaction hash", async () => {
    const store = new MemoryStore();
    await store.reserve({
      caseCommitment: commitment,
      caseId,
      contractAddress,
      deploymentId: deployment.id,
      idempotencyKey,
      publicCaseFileUrl,
      runtimeAddress,
      tenantId,
    });
    const submissionId = store.record?.id;
    if (!submissionId) throw new Error("The submission was not reserved.");
    await store.markSubmitting(tenantId, submissionId);
    await store.markSubmitted(tenantId, submissionId, transactionHash);
    const submissionClient = client();

    await expect(submit(store, submissionClient)).resolves.toMatchObject({
      receipt: { status: "finalized", verdict: "pass" },
    });
    expect(submissionClient.submit).not.toHaveBeenCalled();
  });

  it("blocks automatic resubmission after an uncertain broadcast", async () => {
    const store = new MemoryStore();
    const firstClient = client({ submit: vi.fn(async () => Promise.reject(new Error("timeout"))) });

    await expect(submit(store, firstClient)).rejects.toMatchObject({
      code: "attestation_submission_uncertain",
    });
    const secondClient = client();
    await expect(submit(store, secondClient)).rejects.toMatchObject({
      code: "attestation_submission_uncertain",
    });
    expect(secondClient.submit).not.toHaveBeenCalled();
  });

  it("requires an active contract in the same workspace", async () => {
    const store = new MemoryStore();
    await expect(
      ensureManagedAttestationSubmission({
        caseId,
        client: client(),
        deployment: { ...deployment, tenantId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
        request,
        store,
        tenantId,
      }),
    ).rejects.toMatchObject({ code: "policy_contract_tenant_mismatch" });
  });

  it("requires the case policy to match the active contract binding", async () => {
    await expect(
      ensureManagedAttestationSubmission({
        caseId,
        client: client(),
        deployment: { ...deployment, bindingDigest: `sha256:${"d".repeat(64)}` },
        request,
        store: new MemoryStore(),
        tenantId,
      }),
    ).rejects.toMatchObject({ code: "policy_contract_binding_mismatch" });
  });

  it("rejects an idempotency record bound to different case facts", async () => {
    const store = new MemoryStore();
    await store.reserve({
      caseCommitment: `sha256:${"e".repeat(64)}`,
      caseId,
      contractAddress,
      deploymentId: deployment.id,
      idempotencyKey,
      publicCaseFileUrl,
      runtimeAddress,
      tenantId,
    });

    await expect(submit(store, client())).rejects.toMatchObject({
      code: "attestation_idempotency_conflict",
    });
  });
});
