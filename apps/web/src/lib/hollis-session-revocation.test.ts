import { describe, expect, it, vi } from "vitest";
import {
  revokeHollisSession,
  SessionRevocationUnavailableError,
} from "./hollis-session-revocation";

describe("Hollis session revocation", () => {
  it("requires a successful server revocation before local logout", async () => {
    const fetchImplementation = vi.fn(async () => new Response(null, { status: 204 }));

    await expect(
      revokeHollisSession("http://api.test", "session-token", fetchImplementation),
    ).resolves.toBeUndefined();
    expect(fetchImplementation).toHaveBeenCalledWith(
      "http://api.test/v1/auth/sessions/current",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("permits clearing a known-invalid session token", async () => {
    await expect(
      revokeHollisSession(
        "http://api.test",
        "expired-token",
        async () => new Response(null, { status: 401 }),
      ),
    ).resolves.toBeUndefined();
  });

  it.each([
    ["network failure", async () => Promise.reject(new Error("network unavailable"))],
    ["server rejection", async () => new Response(null, { status: 500 })],
  ])("retains the local session when revocation has a %s", async (_name, fetchImplementation) => {
    await expect(
      revokeHollisSession("http://api.test", "session-token", fetchImplementation),
    ).rejects.toBeInstanceOf(SessionRevocationUnavailableError);
  });
});
