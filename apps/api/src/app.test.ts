import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import type { AccessTokenVerifier } from "./auth.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const environment = {
  API_HOST: "127.0.0.1",
  API_PORT: 4000,
  NODE_ENV: "test" as const,
  WEB_ORIGIN: "http://localhost:3000",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_ISSUER: "https://api.workos.com",
  WORKOS_JWKS_URL: "https://api.workos.com/sso/jwks/client_test",
};

describe("API boundaries", () => {
  it("reports that the process is live", async () => {
    const app = await buildApp(environment);
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("rejects a protected request without a bearer token", async () => {
    const app = await buildApp(environment);
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/v1/session" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      code: "unauthorized",
      message: "Authentication required.",
    });
  });

  it("returns identity derived from a verified organization-scoped token", async () => {
    const verifier: AccessTokenVerifier = {
      async verify(token) {
        expect(token).toBe("verified-token");
        return {
          organizationId: "org_01",
          permissions: ["reviews:read"],
          role: "reviewer",
          sessionId: "session_01",
          userId: "user_01",
        };
      },
    };
    const app = await buildApp(environment, { accessTokenVerifier: verifier });
    apps.push(app);

    const response = await app.inject({
      headers: { authorization: "Bearer verified-token" },
      method: "GET",
      url: "/v1/session",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      organizationId: "org_01",
      permissions: ["reviews:read"],
      role: "reviewer",
      userId: "user_01",
    });
  });
});
