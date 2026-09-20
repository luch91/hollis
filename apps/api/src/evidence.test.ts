import { describe, expect, it, vi } from "vitest";
import {
  createEvidenceDownload,
  EvidenceUploadExpiredError,
  EvidenceVerificationError,
  verifyEvidenceUpload,
  type EvidenceMetadataStore,
} from "./evidence.js";
import type { EvidenceStorage } from "./evidence-storage.js";

const evidence = {
  digest: `sha256:${"a".repeat(64)}`,
  id: "evidence-1",
  mediaType: "application/pdf",
  objectName: "tenants/tenant-1/evidence/example",
  sizeBytes: 10,
  verified: false,
};

function metadataStore(): EvidenceMetadataStore {
  return {
    async create() {
      return { id: evidence.id };
    },
    async markVerified() {},
    async get() {
      return evidence;
    },
    async list() {
      return [];
    },
  };
}

describe("evidence verification", () => {
  it("verifies the stored object before marking metadata", async () => {
    const verify = vi.fn(async () => ({
      digest: evidence.digest,
      mediaType: evidence.mediaType,
      objectName: evidence.objectName,
      sizeBytes: evidence.sizeBytes,
    }));
    const markVerified = vi.fn(async () => {});
    const metadata = { ...metadataStore(), markVerified };
    const promote = vi.fn(async () => ({
      digest: evidence.digest,
      mediaType: evidence.mediaType,
      objectName: "tenants/tenant-1/evidence/final/example",
      providerEtag: "etag-1",
      providerVersion: "generation-1",
      sizeBytes: evidence.sizeBytes,
    }));
    const storage = { promote, verify } as unknown as EvidenceStorage;

    await verifyEvidenceUpload("tenant-1", "case-1", evidence.id, storage, metadata);

    expect(verify).toHaveBeenCalledWith("tenant-1", evidence.objectName, evidence);
    expect(promote).toHaveBeenCalledWith(
      "tenant-1",
      evidence.objectName,
      "tenants/tenant-1/evidence/final/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(markVerified).toHaveBeenCalledWith(
      "tenant-1",
      "case-1",
      evidence.id,
      expect.objectContaining({ providerVersion: "generation-1" }),
      undefined,
    );
  });

  it("does not issue a download URL for unverified evidence", async () => {
    const createDownloadUrl = vi.fn(async () => "https://example.test/download");
    const storage = { createDownloadUrl } as unknown as EvidenceStorage;

    await expect(
      createEvidenceDownload("tenant-1", "case-1", evidence.id, storage, metadataStore()),
    ).resolves.toBeNull();
    expect(createDownloadUrl).not.toHaveBeenCalled();
  });

  it("rejects an expired quarantine authorization without reading provider bytes", async () => {
    const verify = vi.fn();
    const markExpired = vi.fn(async () => {});
    const metadata = {
      ...metadataStore(),
      get: async () => ({ ...evidence, expiresAt: new Date(Date.now() - 1) }),
      markExpired,
    } satisfies EvidenceMetadataStore;

    await expect(
      verifyEvidenceUpload(
        "tenant-1",
        "case-1",
        evidence.id,
        { verify } as unknown as EvidenceStorage,
        metadata,
      ),
    ).rejects.toBeInstanceOf(EvidenceUploadExpiredError);
    expect(verify).not.toHaveBeenCalled();
    expect(markExpired).toHaveBeenCalledWith("tenant-1", "case-1", evidence.id, undefined);
  });

  it.each([
    ["wrong size", { sizeBytes: evidence.sizeBytes + 1 }],
    ["wrong media type", { mediaType: "application/octet-stream" }],
  ])("rejects provider metadata with %s", async (_label, mismatch) => {
    const markFailed = vi.fn(async () => {});
    const markVerified = vi.fn(async () => {});
    const storage = {
      promote: vi.fn(),
      verify: vi.fn(async () => ({ ...evidence, ...mismatch })),
    } as unknown as EvidenceStorage;

    await expect(
      verifyEvidenceUpload("tenant-1", "case-1", evidence.id, storage, {
        ...metadataStore(),
        markFailed,
        markVerified,
      }),
    ).rejects.toBeInstanceOf(EvidenceVerificationError);
    expect(markVerified).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledWith("tenant-1", "case-1", evidence.id, undefined);
  });
});
