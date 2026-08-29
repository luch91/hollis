import { Storage } from "@google-cloud/storage";
import { createHash } from "node:crypto";

export type EvidenceObject = {
  digest: string;
  mediaType: string;
  objectName: string;
  sizeBytes: number;
};

export interface EvidenceStorage {
  createDownloadUrl(tenantId: string, objectName: string): Promise<string>;
  createUploadUrl(tenantId: string, objectName: string, mediaType: string): Promise<string>;
  put(
    tenantId: string,
    objectName: string,
    content: Buffer,
    mediaType: string,
    expectedDigest: string,
  ): Promise<EvidenceObject>;
}

export function evidenceObjectName(tenantId: string, digest: string): string {
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid evidence digest.");
  return `tenants/${tenantId}/evidence/${digest.slice("sha256:".length)}`;
}

export function createGoogleCloudEvidenceStorage(
  projectId: string,
  bucketName: string,
): EvidenceStorage {
  const bucket = new Storage({ projectId }).bucket(bucketName);
  const signedUrlOptions = { version: "v4" as const, expires: Date.now() + 15 * 60 * 1000 };

  return {
    async createDownloadUrl(tenantId, objectName) {
      const [url] = await bucket
        .file(assertTenantObject(tenantId, objectName))
        .getSignedUrl({ ...signedUrlOptions, action: "read" });
      return url;
    },
    async createUploadUrl(tenantId, objectName, mediaType) {
      const [url] = await bucket
        .file(assertTenantObject(tenantId, objectName))
        .getSignedUrl({ ...signedUrlOptions, action: "write", contentType: mediaType });
      return url;
    },
    async put(tenantId, objectName, content, mediaType, expectedDigest) {
      const digest = `sha256:${createHash("sha256").update(content).digest("hex")}`;
      if (digest !== expectedDigest) throw new Error("Evidence digest does not match content.");
      const file = bucket.file(assertTenantObject(tenantId, objectName));
      await file.save(content, { contentType: mediaType, resumable: false, validation: "md5" });
      return { digest, mediaType, objectName, sizeBytes: content.byteLength };
    },
  };
}

function assertTenantObject(tenantId: string, objectName: string): string {
  if (!objectName.startsWith(`tenants/${tenantId}/`))
    throw new Error("Evidence object is outside the tenant boundary.");
  return objectName;
}
