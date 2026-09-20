import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { BlobServiceClient } from "@azure/storage-blob";
import { describe, expect, it, vi } from "vitest";
import { createAzureBlobEvidenceStorage } from "./azure-blob-evidence-storage.js";

const tenantId = "tenant-1";
const objectName = `tenants/${tenantId}/evidence/${"a".repeat(64)}`;
const content = Buffer.from("verified evidence");
const digest = `sha256:${createHash("sha256").update(content).digest("hex")}`;

function blobClient() {
  return {
    deleteIfExists: vi.fn().mockResolvedValue(undefined),
    download: vi.fn().mockResolvedValue({ readableStreamBody: Readable.from([content]) }),
    exists: vi.fn().mockResolvedValue(false),
    getProperties: vi.fn().mockResolvedValue({
      contentLength: content.byteLength,
      contentType: "text/plain",
    }),
    uploadData: vi.fn().mockResolvedValue(undefined),
    url: "https://hollisevidencedemo.blob.core.windows.net/evidence/object",
    withVersion: vi.fn(function withVersion(version: string) {
      return {
        url: `https://hollisevidencedemo.blob.core.windows.net/evidence/object?versionid=${version}`,
      };
    }),
  };
}

function service(blockBlobClient: ReturnType<typeof blobClient>) {
  return {
    getContainerClient: vi.fn(() => ({ getBlockBlobClient: vi.fn(() => blockBlobClient) })),
    getUserDelegationKey: vi.fn().mockResolvedValue({
      signedExpiry: "2030-01-01T00:00:00Z",
      signedOid: "00000000-0000-0000-0000-000000000001",
      signedService: "b",
      signedStart: "2020-01-01T00:00:00Z",
      signedTid: "00000000-0000-0000-0000-000000000001",
      signedVersion: "2020-02-10",
      value: "test-key",
    }),
  } as unknown as BlobServiceClient;
}

describe("Azure Blob evidence storage", () => {
  it("signs downloads against the recorded immutable version", async () => {
    const blob = blobClient();
    const storage = createAzureBlobEvidenceStorage("hollisevidencedemo", "evidence", service(blob));

    await expect(storage.createDownloadUrl(tenantId, objectName, "version-42")).resolves.toContain(
      "versionid=version-42",
    );
    expect(blob.withVersion).toHaveBeenCalledWith("version-42");
  });

  it("stores evidence under the tenant path", async () => {
    const blob = blobClient();
    const storage = createAzureBlobEvidenceStorage("hollisevidencedemo", "evidence", service(blob));

    await expect(storage.put(tenantId, objectName, content, "text/plain", digest)).resolves.toEqual(
      {
        digest,
        mediaType: "text/plain",
        objectName,
        sizeBytes: content.byteLength,
      },
    );

    expect(blob.uploadData).toHaveBeenCalledWith(content, {
      blobHTTPHeaders: { blobContentType: "text/plain" },
    });
  });

  it("verifies stored bytes and declared metadata", async () => {
    const blob = blobClient();
    const storage = createAzureBlobEvidenceStorage("hollisevidencedemo", "evidence", service(blob));

    await expect(
      storage.verify(tenantId, objectName, {
        digest,
        mediaType: "text/plain",
        sizeBytes: content.byteLength,
      }),
    ).resolves.toEqual({
      digest,
      mediaType: "text/plain",
      objectName,
      providerEtag: null,
      providerVersion: null,
      sizeBytes: content.byteLength,
    });
  });

  it("rejects objects outside the tenant boundary", async () => {
    const blob = blobClient();
    const storage = createAzureBlobEvidenceStorage("hollisevidencedemo", "evidence", service(blob));

    await expect(
      storage.delete(tenantId, `tenants/tenant-2/evidence/${"a".repeat(64)}`),
    ).rejects.toThrow("outside the tenant boundary");
    expect(blob.deleteIfExists).not.toHaveBeenCalled();
  });
});
