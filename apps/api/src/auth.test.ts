import { describe, expect, it } from "vitest";
import {
  type ApplicationSessionStore,
  createHollisAccessTokenVerifier,
  createHollisUnscopedAccessTokenVerifier,
  InsufficientPermissionError,
  InvalidAccessTokenError,
  readBearerToken,
  requirePermission,
} from "./auth.js";

function createSessionStore(
  session: Awaited<ReturnType<ApplicationSessionStore["read"]>>,
): ApplicationSessionStore {
  return {
    async activate() {
      throw new Error("Not used by this test.");
    },
    async establish() {
      throw new Error("Not used by this test.");
    },
    async read(tokenDigest) {
      expect(tokenDigest).toHaveLength(71);
      return session;
    },
    async revoke() {
      throw new Error("Not used by this test.");
    },
  };
}

describe("Hollis application-session verification", () => {
  it("resolves a tenant-scoped principal with permissions derived from its role", async () => {
    const verifier = createHollisAccessTokenVerifier(
      createSessionStore({
        role: "reviewer",
        sessionId: "session_01",
        tenantId: "tenant_01",
        userId: "user_01",
        workspaceName: "Asher IT",
      }),
    );

    await expect(verifier.verify("session-token")).resolves.toEqual({
      permissions: ["reviews:read", "reviews:create", "reviews:assign", "reviews:escalate", "reviews:decide", "reviews:attest"],
      role: "reviewer",
      sessionId: "session_01",
      tenantId: "tenant_01",
      userId: "user_01",
    });
  });

  it("keeps a signed-in user without a workspace outside protected routes", async () => {
    const sessionStore = createSessionStore({
      role: null,
      sessionId: "session_01",
      tenantId: null,
      userId: "user_01",
      workspaceName: null,
    });

    await expect(createHollisAccessTokenVerifier(sessionStore).verify("session-token")).rejects.toBeInstanceOf(
      InvalidAccessTokenError,
    );
    await expect(createHollisUnscopedAccessTokenVerifier(sessionStore).verify("session-token")).resolves.toEqual({
      activeWorkspace: null,
      sessionId: "session_01",
      userId: "user_01",
    });
  });
});

describe("authorization boundaries", () => {
  const principal = {
    permissions: ["reviews:read"],
    role: "reviewer" as const,
    sessionId: "session_01",
    tenantId: "tenant_01",
    userId: "user_01",
  };

  it("requires exact bearer syntax", () => {
    expect(readBearerToken("Bearer token-value")).toBe("token-value");
    expect(() => readBearerToken("bearer token-value")).toThrow(InvalidAccessTokenError);
    expect(() => readBearerToken("Bearer token value")).toThrow(InvalidAccessTokenError);
  });

  it("requires an explicitly granted permission", () => {
    expect(() => requirePermission(principal, "reviews:read")).not.toThrow();
    expect(() => requirePermission(principal, "reviews:decide")).toThrow(
      InsufficientPermissionError,
    );
  });
});
