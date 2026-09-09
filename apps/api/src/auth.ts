import { digestApplicationSessionToken } from "./identity-platform.js";

const rolePermissions = {
  administrator: [
    "reviews:read",
    "reviews:create",
    "reviews:assign",
    "reviews:escalate",
    "reviews:decide",
    "reviews:attest",
    "reviews:retain",
    "workspace:manage",
    "policies:manage",
  ],
  auditor: ["reviews:read"],
  contributor: ["reviews:create"],
  owner: [
    "reviews:read",
    "reviews:create",
    "reviews:assign",
    "reviews:escalate",
    "reviews:decide",
    "reviews:attest",
    "reviews:retain",
    "workspace:manage",
    "policies:manage",
  ],
  reviewer: [
    "reviews:read",
    "reviews:create",
    "reviews:assign",
    "reviews:escalate",
    "reviews:decide",
    "reviews:attest",
  ],
} as const;

type HollisRole = keyof typeof rolePermissions;

export type AuthenticatedPrincipal = {
  permissions: readonly string[];
  role: HollisRole;
  sessionId: string;
  tenantId: string;
  userId: string;
};

export type UnscopedAuthenticatedPrincipal = {
  activeWorkspace: {
    id: string;
    name: string;
    role: HollisRole;
  } | null;
  sessionId: string;
  userId: string;
};

export type StoredApplicationSession = {
  role: string | null;
  sessionId: string;
  tenantId: string | null;
  userId: string;
  workspaceName: string | null;
};

export interface ApplicationSessionStore {
  activate(tokenDigest: string, tenantId: string): Promise<StoredApplicationSession | null>;
  establish(input: {
    avatarUrl: string | null;
    displayName: string | null;
    email: string;
    expiresAt: Date;
    subject: string;
    tokenDigest: string;
  }): Promise<StoredApplicationSession>;
  read(tokenDigest: string): Promise<StoredApplicationSession | null>;
  revoke(tokenDigest: string): Promise<boolean>;
}

export interface UnscopedAccessTokenVerifier {
  verify(token: string): Promise<UnscopedAuthenticatedPrincipal>;
}

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

function parseRole(value: string | null): HollisRole {
  if (!value || !(value in rolePermissions)) {
    throw new InvalidAccessTokenError();
  }

  return value as HollisRole;
}

async function readSession(
  token: string,
  store: ApplicationSessionStore,
): Promise<StoredApplicationSession> {
  const record = await store.read(digestApplicationSessionToken(token));
  if (!record) throw new InvalidAccessTokenError();
  return record;
}

export function createHollisUnscopedAccessTokenVerifier(
  store: ApplicationSessionStore,
): UnscopedAccessTokenVerifier {
  return {
    async verify(token) {
      const record = await readSession(token, store);
      if (!record.tenantId) {
        return {
          activeWorkspace: null,
          sessionId: record.sessionId,
          userId: record.userId,
        };
      }

      const role = parseRole(record.role);
      if (!record.workspaceName) throw new InvalidAccessTokenError();
      return {
        activeWorkspace: {
          id: record.tenantId,
          name: record.workspaceName,
          role,
        },
        sessionId: record.sessionId,
        userId: record.userId,
      };
    },
  };
}

export function createHollisAccessTokenVerifier(
  store: ApplicationSessionStore,
): AccessTokenVerifier {
  const unscoped = createHollisUnscopedAccessTokenVerifier(store);
  return {
    async verify(token) {
      const principal = await unscoped.verify(token);
      if (!principal.activeWorkspace) throw new InvalidAccessTokenError();

      return {
        permissions: rolePermissions[principal.activeWorkspace.role],
        role: principal.activeWorkspace.role,
        sessionId: principal.sessionId,
        tenantId: principal.activeWorkspace.id,
        userId: principal.userId,
      };
    },
  };
}

export function requirePermission(principal: AuthenticatedPrincipal, permission: string): void {
  if (!principal.permissions.includes(permission)) {
    throw new InsufficientPermissionError();
  }
}

export function readBearerToken(authorization: string | undefined): string {
  if (!authorization) {
    throw new InvalidAccessTokenError();
  }

  const match = /^Bearer ([A-Za-z0-9_-]{1,512})$/.exec(authorization);
  if (!match?.[1]) {
    throw new InvalidAccessTokenError();
  }

  return match[1];
}
