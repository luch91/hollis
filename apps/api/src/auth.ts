import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";
import type { Environment } from "./config.js";

const accessTokenClaimsSchema = z.object({
  client_id: z.string().min(1),
  org_id: z.string().min(1),
  permissions: z.array(z.string()),
  role: z.string().min(1),
  sid: z.string().min(1),
  sub: z.string().min(1),
});

export type AuthenticatedPrincipal = {
  organizationId: string;
  permissions: readonly string[];
  role: string;
  sessionId: string;
  userId: string;
};

export interface AccessTokenVerifier {
  verify(token: string): Promise<AuthenticatedPrincipal>;
}

export class InvalidAccessTokenError extends Error {
  constructor() {
    super("The access token is invalid.");
    this.name = "InvalidAccessTokenError";
  }
}

export class InsufficientPermissionError extends Error {
  constructor() {
    super("The principal does not have the required permission.");
    this.name = "InsufficientPermissionError";
  }
}

export async function verifyAccessToken(
  token: string,
  keySet: JWTVerifyGetKey,
  options: { clientId: string; issuer: string },
): Promise<AuthenticatedPrincipal> {
  try {
    const { payload } = await jwtVerify(token, keySet, { issuer: options.issuer });
    const claims = accessTokenClaimsSchema.parse(payload);

    if (claims.client_id !== options.clientId) {
      throw new InvalidAccessTokenError();
    }

    return {
      organizationId: claims.org_id,
      permissions: claims.permissions,
      role: claims.role,
      sessionId: claims.sid,
      userId: claims.sub,
    };
  } catch (error) {
    if (error instanceof errors.JOSEError || error instanceof z.ZodError) {
      throw new InvalidAccessTokenError();
    }

    throw error;
  }
}

export function requirePermission(principal: AuthenticatedPrincipal, permission: string): void {
  if (!principal.permissions.includes(permission)) {
    throw new InsufficientPermissionError();
  }
}

export function createWorkOsAccessTokenVerifier(
  environment: Pick<Environment, "WORKOS_CLIENT_ID" | "WORKOS_ISSUER" | "WORKOS_JWKS_URL">,
): AccessTokenVerifier {
  const keySet = createRemoteJWKSet(new URL(environment.WORKOS_JWKS_URL));

  return {
    async verify(token) {
      return verifyAccessToken(token, keySet, {
        clientId: environment.WORKOS_CLIENT_ID,
        issuer: environment.WORKOS_ISSUER,
      });
    },
  };
}

export function readBearerToken(authorization: string | undefined): string {
  if (!authorization) {
    throw new InvalidAccessTokenError();
  }

  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match?.[1]) {
    throw new InvalidAccessTokenError();
  }

  return match[1];
}
