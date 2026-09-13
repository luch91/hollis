import {
  createPolicyVersionSchema,
  policyVersionSchema,
  type CreatePolicyVersion,
  type PolicyContractBinding,
  type PolicyVersion,
} from "@hollis/contracts";

export interface PolicyLibraryStore {
  create(tenantId: string, actorId: string, input: CreatePolicyVersion): Promise<PolicyVersion>;
  findControl(
    tenantId: string,
    policyId: string,
    policyVersion: string,
    controlId: string,
  ): Promise<PolicyVersion | null>;
  list(tenantId: string): Promise<PolicyVersion[]>;
  findControlRecord(
    tenantId: string,
    policyVersionId: string,
    controlId: string,
  ): Promise<{ binding: PolicyContractBinding; controlRecordId: string } | null>;
}

export async function createPublishedPolicy(
  tenantId: string,
  actorId: string,
  input: unknown,
  store: PolicyLibraryStore,
): Promise<PolicyVersion> {
  return store.create(tenantId, actorId, createPolicyVersionSchema.parse(input));
}

export function assertPublishedCasePolicy(
  policy: PolicyVersion | null,
  policyId: string,
  policyVersion: string,
  controlId: string,
): void {
  if (
    !policy ||
    policy.policyId !== policyId ||
    policy.version !== policyVersion ||
    !policy.controls.some((item) => item.controlId === controlId)
  ) {
    throw new PolicyBindingError();
  }
  policyVersionSchema.parse(policy);
}

export class PolicyBindingError extends Error {
  constructor() {
    super("The selected policy control is not published for this workspace.");
  }
}

export class PolicyVersionConflictError extends Error {
  constructor() {
    super("A different policy version already uses this policy ID and version.");
  }
}
