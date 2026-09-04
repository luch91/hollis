import { describe, expect, it, vi } from "vitest";
import {
  createEvidenceDownload,
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
    const storage = { verify } as unknown as EvidenceStorage;

    await verifyEvidenceUpload("tenant-1", "case-1", evidence.id, storage, metadata);

    expect(verify).toHaveBeenCalledWith("tenant-1", evidence.objectName, evidence);
    expect(markVerified).toHaveBeenCalledWith("tenant-1", "case-1", evidence.id);
  });

  it("does not issue a download URL for unverified evidence", async () => {
    const createDownloadUrl = vi.fn(async () => "https://example.test/download");
    const storage = { createDownloadUrl } as unknown as EvidenceStorage;

    await expect(
      createEvidenceDownload("tenant-1", "case-1", evidence.id, storage, metadataStore()),
    ).resolves.toBeNull();
    expect(createDownloadUrl).not.toHaveBeenCalled();
  });
});
