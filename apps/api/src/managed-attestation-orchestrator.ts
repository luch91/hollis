import { createHash, randomUUID } from "node:crypto";
import type { ManagedAttestationSubmission, PolicyContractDeployment } from "@hollis/contracts";
import type { PublicAttestationCaseFileStore } from "./attestation.js";
import {
  buildAdjudicationCaseFile,
  buildGenLayerAttestationRequest,
} from "./attestation-workflow.js";
import type { EvidenceMetadataStore } from "./evidence.js";
import {
  beginManagedAttestationSubmission,
  type ManagedAttestationClient,
  type ManagedAttestationSubmissionStore,
  reconcileManagedAttestationSubmission,
} from "./managed-attestation-submission.js";
import {
  beginPolicyContractDeployment,
  type PolicyContractDeploymentClient,
  type PolicyContractDeploymentStore,
  reconcilePolicyContractDeployment,
} from "./policy-contract-deployment.js";
import type { PolicyLibraryStore } from "./policy-library.js";
import type { ReviewWorkflowStore } from "./workflow.js";

export type ManagedAttestationProgress = {
  deployment: PolicyContractDeployment | null;
  submission: ManagedAttestationSubmission | null;
};

type Dependencies = {
  attestationClient: ManagedAttestationClient;
  deploymentClient: PolicyContractDeploymentClient;
  deploymentStore: PolicyContractDeploymentStore;
  evidenceMetadataStore: EvidenceMetadataStore;
  publicCaseFileStore: PublicAttestationCaseFileStore;
  publicOrigin: string;
  source: string;
  submissionStore: ManagedAttestationSubmissionStore;
  workflowStore: ReviewWorkflowStore;
  policyLibraryStore: PolicyLibraryStore;
  runtimeAddress: string;
};

async function casePolicyBinding(
  dependencies: Dependencies,
  tenantId: string,
  policyId: string | null | undefined,
  policyVersion: string,
  ruleId: string,
) {
  if (!policyId) return null;
  const policy = (await dependencies.policyLibraryStore.list(tenantId)).find(
    (candidate) => candidate.policyId === policyId && candidate.version === policyVersion,
  );
  if (!policy) return null;
  return dependencies.policyLibraryStore.findControlRecord(tenantId, policy.id, ruleId);
}

/**
 * Starts all eligible work after a completed human decision. It persists before
 * every chain write and returns quickly after broadcast. Consensus is advanced
 * by later bounded reconciliation calls.
 */
export async function startManagedAttestationForCase(input: {
  actorId: string;
  caseId: string;
  dependencies: Dependencies;
  tenantId: string;
}): Promise<ManagedAttestationProgress> {
  const exported = await input.dependencies.workflowStore.exportCase(input.tenantId, input.caseId);
  if (exported?.case.status !== "completed" || !exported.case.decisionOutcome) {
    return { deployment: null, submission: null };
  }
  // A public receipt would amplify a broken private record. Do not publish or
  // submit an attestation until the independently reproducible audit chain is
  // intact; the export exposes the failure to authorized users for response.
  if (exported.auditIntegrity?.status !== "verified") {
    return { deployment: null, submission: null };
  }
  const control = await casePolicyBinding(
    input.dependencies,
    input.tenantId,
    exported.case.policyId,
    exported.case.policyVersion,
    exported.case.ruleId,
  );
  if (!control) return { deployment: null, submission: null };

  let deployment = await input.dependencies.deploymentStore.findByPolicyControl(
    input.tenantId,
    control.controlRecordId,
  );
  // Earlier versions are retained strictly for historical reads. A new submission must bind
  // the V9 authorization and canonical-record guarantees.
  if (deployment && deployment.sourceVersion !== "v9") deployment = null;
  if (!deployment) {
    deployment = await beginPolicyContractDeployment({
      binding: control.binding,
      client: input.dependencies.deploymentClient,
      createdByUserId: input.actorId,
      policyControlRecordId: control.controlRecordId,
      runtimeAddress: input.dependencies.runtimeAddress,
      source: input.dependencies.source,
      sourceVersion: "v9",
      store: input.dependencies.deploymentStore,
      tenantId: input.tenantId,
    });
  }
  deployment = await reconcilePolicyContractDeployment({
    client: input.dependencies.deploymentClient,
    deployment,
    store: input.dependencies.deploymentStore,
    tenantId: input.tenantId,
  });
  if (deployment.status !== "active") return { deployment, submission: null };

  const evidence = await input.dependencies.evidenceMetadataStore.list(
    input.tenantId,
    input.caseId,
  );
  const existingFiles = await input.dependencies.publicCaseFileStore.list(
    input.tenantId,
    input.caseId,
    input.dependencies.publicOrigin,
  );
  const caseFile = buildAdjudicationCaseFile(exported, evidence, { policy: control.binding });
  const existing = existingFiles.find(
    (record) =>
      record.caseFile.caseCommitment === caseFile.caseCommitment &&
      record.caseFile.policy.policyId === caseFile.policy.policyId &&
      record.caseFile.policy.policyVersion === caseFile.policy.policyVersion &&
      record.caseFile.policy.control.controlId === caseFile.policy.control.controlId,
  );
  const publicId = randomUUID();
  const publicCaseFile =
    existing ??
    (await input.dependencies.publicCaseFileStore.create(
      input.tenantId,
      input.caseId,
      input.actorId,
      publicId,
      caseFile,
      new URL(
        `/v1/public/attestation-case-files/${publicId}`,
        input.dependencies.publicOrigin,
      ).toString(),
    ));
  const request = buildGenLayerAttestationRequest(exported, evidence, {
    policy: control.binding,
    publicCaseFileUrl: publicCaseFile.publicCaseFileUrl,
  });
  const deploymentScopedRequest = {
    ...request,
    idempotencyKey: `sha256:${createHash("sha256")
      .update(`${request.idempotencyKey}\n${deployment.id}`)
      .digest("hex")}`,
  };
  const submission = await beginManagedAttestationSubmission({
    caseId: input.caseId,
    client: input.dependencies.attestationClient,
    deployment,
    request: deploymentScopedRequest,
    store: input.dependencies.submissionStore,
    tenantId: input.tenantId,
  });
  return { deployment, submission };
}

/** Reconciles the persisted case lifecycle without rebroadcasting any transaction. */
export async function reconcileManagedAttestationForCase(input: {
  actorId: string;
  caseId: string;
  dependencies: Dependencies;
  tenantId: string;
}): Promise<ManagedAttestationProgress> {
  const existingSubmission = await input.dependencies.submissionStore.findByCase(
    input.tenantId,
    input.caseId,
  );
  if (existingSubmission) {
    const existingDeployment = await input.dependencies.deploymentStore.find(
      input.tenantId,
      existingSubmission.deploymentId,
    );
    if (
      (existingSubmission.status === "failed" ||
        existingSubmission.status === "reconciliation_required") &&
      existingDeployment?.sourceVersion !== "v9"
    ) {
      return startManagedAttestationForCase(input);
    }
    return {
      deployment: existingDeployment,
      submission: await reconcileManagedAttestationSubmission({
        client: input.dependencies.attestationClient,
        store: input.dependencies.submissionStore,
        submission: existingSubmission,
        tenantId: input.tenantId,
      }),
    };
  }
  return startManagedAttestationForCase(input);
}
