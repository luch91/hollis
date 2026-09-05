import { WorkOS } from "@workos-inc/node";
import { z } from "zod";

export const createWorkspaceSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
  })
  .strict();

export type WorkspaceProvisioningRecord = {
  organizationId: string;
  tenantId: string;
};

export class WorkspaceProvisioningError extends Error {
  constructor(
    readonly code:
      | "organization_creation_failed"
      | "membership_assignment_failed"
      | "tenant_provisioning_failed",
  ) {
    super("Workspace provisioning could not be completed.");
    this.name = "WorkspaceProvisioningError";
  }
}

export interface WorkspaceProvisioningStore {
  provision(input: {
    creatorUserId: string;
    membershipId: string;
    organizationId: string;
    organizationName: string;
    role: string;
  }): Promise<WorkspaceProvisioningRecord>;
}

export interface WorkspaceProvisioner {
  create(input: {
    idempotencyKey: string;
    name: string;
    userId: string;
  }): Promise<WorkspaceProvisioningRecord>;
}

export function createWorkOsWorkspaceProvisioner(
  apiKey: string,
  initialAdminRoleSlug: string,
  store: WorkspaceProvisioningStore,
): WorkspaceProvisioner {
  const workos = new WorkOS(apiKey);

  return {
    async create(input) {
      let organization;
      try {
        organization = await workos.organizations.createOrganization(
          { name: input.name },
          { idempotencyKey: input.idempotencyKey },
        );
      } catch {
        throw new WorkspaceProvisioningError("organization_creation_failed");
      }

      let membership;
      try {
        const memberships = await workos.userManagement.listOrganizationMemberships({
          organizationId: organization.id,
          statuses: ["active"],
          userId: input.userId,
        });
        membership =
          memberships.data[0] ??
          (await workos.userManagement.createOrganizationMembership({
            organizationId: organization.id,
            roleSlug: initialAdminRoleSlug,
            userId: input.userId,
          }));
      } catch {
        throw new WorkspaceProvisioningError("membership_assignment_failed");
      }

      try {
        return await store.provision({
          creatorUserId: input.userId,
          membershipId: membership.id,
          organizationId: organization.id,
          organizationName: organization.name,
          role: initialAdminRoleSlug,
        });
      } catch {
        throw new WorkspaceProvisioningError("tenant_provisioning_failed");
      }
    },
  };
}
