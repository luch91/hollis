import { z } from "zod";

export const createWorkspaceSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
  })
  .strict();

export type WorkspaceProvisioningRecord = {
  role: string;
  tenantId: string;
  workspaceName: string;
};

export class WorkspaceProvisioningError extends Error {
  constructor(
    readonly code: "tenant_provisioning_failed",
    readonly diagnostic: string,
  ) {
    super("Workspace provisioning could not be completed.");
    this.name = "WorkspaceProvisioningError";
  }
}

function databaseDiagnostic(error: unknown): string {
  let candidate = error;
  for (let depth = 0; depth < 3; depth += 1) {
    if (
      typeof candidate === "object" &&
      candidate !== null &&
      "code" in candidate &&
      typeof candidate.code === "string" &&
      /^[0-9A-Z]{5}$/.test(candidate.code)
    ) {
      return `postgres:${candidate.code}`;
    }

    if (typeof candidate !== "object" || candidate === null || !("cause" in candidate)) {
      break;
    }
    candidate = candidate.cause;
  }

  return "postgres:unknown";
}

export interface WorkspaceProvisioningStore {
  provision(input: { creatorUserId: string; name: string }): Promise<WorkspaceProvisioningRecord>;
  seedDemo?(input: { actorId: string; tenantId: string }): Promise<void>;
}

export interface WorkspaceProvisioner {
  create(input: { name: string; userId: string }): Promise<WorkspaceProvisioningRecord>;
}

export function createHollisWorkspaceProvisioner(
  store: WorkspaceProvisioningStore,
): WorkspaceProvisioner {
  return {
    async create(input) {
      try {
        const workspace = await store.provision({ creatorUserId: input.userId, name: input.name });
        if (store.seedDemo)
          await store.seedDemo({ actorId: input.userId, tenantId: workspace.tenantId });
        return workspace;
      } catch (error) {
        throw new WorkspaceProvisioningError(
          "tenant_provisioning_failed",
          databaseDiagnostic(error),
        );
      }
    },
  };
}
