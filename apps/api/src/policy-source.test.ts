import { describe, expect, it } from "vitest";
import type { EvidenceStorage } from "./evidence-storage.js";
import {
  assertStoredPolicySource,
  createPolicySource,
  PolicySourceError,
  policySourceObjectName,
} from "./policy-source.js";

const tenantId = "0198ef37-6216-7000-8000-000000000001";

describe("policy source documents", () => {
  it("builds a content-addressed private source record for a verified PDF", () => {
    const source = createPolicySource({
      content: Buffer.from("%PDF-1.7\npolicy"),
      fileName: "release-governance.pdf",
      mediaType: "application/pdf",
    });

    expect(source.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(policySourceObjectName(tenantId, source.digest)).toBe(
      `tenants/${tenantId}/policy-sources/${source.digest.slice("sha256:".length)}`,
    );
  });

  it("rejects a file whose bytes do not match its declared media type", () => {
    expect(() =>
      createPolicySource({
        content: Buffer.from("plain policy text"),
        fileName: "policy.pdf",
        mediaType: "application/pdf",
      }),
    ).toThrow(new PolicySourceError("policy_source_invalid"));
  });

  it("verifies the private tenant-scoped source before policy publication", async () => {
    const source = createPolicySource({
      content: Buffer.from("Human review is required before release."),
      fileName: "release-governance.txt",
      mediaType: "text/plain",
    });
    const storage = {
      async createDownloadUrl() {
        return "https://storage.example/policy";
      },
      async createUploadUrl() {
        return "";
      },
      async delete() {},
      async put() {
        return {
          digest: source.digest,
          mediaType: source.mediaType,
          objectName: policySourceObjectName(tenantId, source.digest),
          sizeBytes: source.sizeBytes,
        };
      },
      async verify(receivedTenantId, objectName, expected) {
        expect(receivedTenantId).toBe(tenantId);
        expect(objectName).toBe(policySourceObjectName(tenantId, source.digest));
        expect(expected).toEqual({
          digest: source.digest,
          mediaType: source.mediaType,
          sizeBytes: source.sizeBytes,
        });
        return {
          ...expected,
          objectName,
        };
      },
    } satisfies EvidenceStorage;

    await expect(
      assertStoredPolicySource(
        tenantId,
        {
          controls: [
            {
              attestationCriterion: "Human review is required.",
              controlId: "human-review-required",
              controlVersion: "1.0",
              evidenceRequirement: "verified_reference_required",
              interpretation: "deterministic",
              title: "Human review required",
            },
          ],
          documentDigest: source.digest,
          policyId: "release-governance",
          source: {
            fileName: source.fileName,
            mediaType: source.mediaType,
            sizeBytes: source.sizeBytes,
          },
          title: "Release Governance",
          version: "1.0",
        },
        storage,
      ),
    ).resolves.toBeUndefined();
  });
});
