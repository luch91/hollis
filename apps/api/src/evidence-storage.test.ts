import { describe, expect, it } from "vitest";
import { GoogleAuth } from "google-auth-library";
import { vi } from "vitest";
import { createGoogleCloudEvidenceStorage, evidenceObjectName } from "./evidence-storage.js";

describe("evidence object boundaries", () => {
  it("creates content-addressed tenant paths", () => {
    const digest = `sha256:${"a".repeat(64)}`;
    expect(evidenceObjectName("tenant-1", digest)).toBe(
      `tenants/tenant-1/evidence/final/${"a".repeat(64)}`,
    );
  });

  it("rejects invalid digests", () => {
    expect(() => evidenceObjectName("tenant-1", "unsafe")).toThrow("Invalid evidence digest");
  });

  it("does not resolve Google credentials while constructing storage", async () => {
    const getClient = vi.spyOn(GoogleAuth.prototype, "getClient");

    await createGoogleCloudEvidenceStorage("hollis-507001", "hollis-evidence-test");

    expect(getClient).not.toHaveBeenCalled();
    getClient.mockRestore();
  });
});
