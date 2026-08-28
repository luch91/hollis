import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import {
  type AccessTokenVerifier,
  type AuthenticatedPrincipal,
  InsufficientPermissionError,
  InvalidAccessTokenError,
  readBearerToken,
  requirePermission,
} from "./auth.js";
import type { TenantContext, TenantResolver } from "./review-intake.js";

declare module "fastify" {
  interface FastifyRequest {
    principal: AuthenticatedPrincipal | null;
    tenant: TenantContext | null;
  }
}

export class TenantAccessError extends Error {
  constructor() {
    super("The authenticated organization is not provisioned for Hollis.");
    this.name = "TenantAccessError";
  }
}

export function createSecurityPreHandler(
  accessTokenVerifier: AccessTokenVerifier,
  tenantResolver: TenantResolver,
  permission?: string,
): preHandlerHookHandler {
  return async function enforceSecurity(request) {
    const token = readBearerToken(request.headers.authorization);
    const principal = await accessTokenVerifier.verify(token);

    if (permission) {
      requirePermission(principal, permission);
    }

    const tenant = await tenantResolver.findByOrganizationId(principal.organizationId);
    if (!tenant) {
      throw new TenantAccessError();
    }

    request.principal = principal;
    request.tenant = tenant;
  };
}

export function sendSecurityError(error: unknown, reply: FastifyReply): boolean {
  if (error instanceof InvalidAccessTokenError) {
    void reply.code(401).send({ code: "unauthorized", message: "Authentication required." });
    return true;
  }

  if (error instanceof InsufficientPermissionError) {
    void reply.code(403).send({ code: "forbidden", message: "Permission denied." });
    return true;
  }

  if (error instanceof TenantAccessError) {
    void reply.code(403).send({
      code: "organization_not_provisioned",
      message: "The active organization does not have Hollis access.",
    });
    return true;
  }

  return false;
}

export function requireRequestContext(request: FastifyRequest) {
  if (!request.principal || !request.tenant) {
    throw new InvalidAccessTokenError();
  }

  return { principal: request.principal, tenant: request.tenant };
}
