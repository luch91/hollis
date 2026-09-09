import {
  createPolicyVersionSchema,
  policyVersionSchema,
  type CreatePolicyVersion,
  type PolicyVersion,
} from "@hollis/contracts";

export interface PolicyLibraryStore {
  create(tenantId: string, actorId: string, input: CreatePolicyVersion): Promise<PolicyVersion>;
  findControl(
    tenantId: string,
    policyVersion: string,
    controlId: string,
  ): Promise<PolicyVersion | null>;
  list(tenantId: string): Promise<PolicyVersion[]>;
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
  policyVersion: string,
  controlId: string,
): void {
  if (
    !policy ||
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
