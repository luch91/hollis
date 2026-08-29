import { describe, expect, it } from "vitest";
import { evidenceObjectName } from "./evidence-storage.js";

describe("evidence object boundaries", () => {
  it("creates content-addressed tenant paths", () => {
    const digest = `sha256:${"a".repeat(64)}`;
    expect(evidenceObjectName("tenant-1", digest)).toBe(
      `tenants/tenant-1/evidence/${"a".repeat(64)}`,
    );
  });

  it("rejects invalid digests", () => {
    expect(() => evidenceObjectName("tenant-1", "unsafe")).toThrow("Invalid evidence digest");
  });
});
