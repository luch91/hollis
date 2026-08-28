import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type AuthenticatedPrincipal,
  InsufficientPermissionError,
  InvalidAccessTokenError,
  readBearerToken,
  requirePermission,
  verifyAccessToken,
} from "./auth.js";

const clientId = "client_test";
const issuer = "https://api.workos.com";
let keySet: ReturnType<typeof createLocalJWKSet>;
let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

beforeAll(async () => {
  const keyPair = await generateKeyPair("RS256");
  privateKey = keyPair.privateKey;
  const publicKey = await exportJWK(keyPair.publicKey);
  keySet = createLocalJWKSet({ keys: [{ ...publicKey, alg: "RS256", kid: "test-key" }] });
});

async function issueToken(overrides: Record<string, unknown> = {}) {
  return new SignJWT({
    client_id: clientId,
    org_id: "org_01",
    permissions: ["reviews:read"],
    role: "reviewer",
    sid: "session_01",
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setSubject("user_01")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

describe("access-token verification", () => {
  it("accepts a signed organization-scoped token", async () => {
    const principal = await verifyAccessToken(await issueToken(), keySet, { clientId, issuer });

    expect(principal).toEqual({
      organizationId: "org_01",
      permissions: ["reviews:read"],
      role: "reviewer",
      sessionId: "session_01",
      userId: "user_01",
    });
  });

  it("rejects a token without an organization", async () => {
    const token = await issueToken({ org_id: undefined });

    await expect(verifyAccessToken(token, keySet, { clientId, issuer })).rejects.toBeInstanceOf(
      InvalidAccessTokenError,
    );
  });

  it("rejects a token from another issuer", async () => {
    await expect(
      verifyAccessToken(await issueToken(), keySet, {
        clientId,
        issuer: "https://example.com/",
      }),
    ).rejects.toBeInstanceOf(InvalidAccessTokenError);
  });

  it("rejects a token issued for another client", async () => {
    await expect(
      verifyAccessToken(await issueToken(), keySet, { clientId: "client_other", issuer }),
    ).rejects.toBeInstanceOf(InvalidAccessTokenError);
  });
});

describe("authorization boundaries", () => {
  const principal: AuthenticatedPrincipal = {
    organizationId: "org_01",
    permissions: ["reviews:read"],
    role: "reviewer",
    sessionId: "session_01",
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
