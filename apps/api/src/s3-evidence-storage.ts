import { createHash } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { EvidenceStorage } from "./evidence-storage.js";

const signedUrlLifetimeSeconds = 15 * 60;

export function createS3EvidenceStorage(
  region: string,
  bucketName: string,
  client = new S3Client({ region }),
): EvidenceStorage {
  return {
    async createDownloadUrl(tenantId, objectName) {
      const key = assertTenantObject(tenantId, objectName);
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucketName, Key: key }), {
        expiresIn: signedUrlLifetimeSeconds,
      });
    },

    async createUploadUrl(tenantId, objectName, mediaType) {
      const key = assertTenantObject(tenantId, objectName);
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
        return "";
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }

      return getSignedUrl(
        client,
        new PutObjectCommand({ Bucket: bucketName, ContentType: mediaType, Key: key }),
        { expiresIn: signedUrlLifetimeSeconds },
      );
    },

    async delete(tenantId, objectName) {
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucketName,
          Key: assertTenantObject(tenantId, objectName),
        }),
      );
    },

    async verify(tenantId, objectName, expected) {
      const key = assertTenantObject(tenantId, objectName);
      const metadata = await client.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
      const stored = await client.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
      if (!stored.Body) throw new Error("Evidence object has no content.");

      const content = Buffer.from(await stored.Body.transformToByteArray());
      const digest = `sha256:${createHash("sha256").update(content).digest("hex")}`;
      if (
        digest !== expected.digest ||
        metadata.ContentLength !== expected.sizeBytes ||
        metadata.ContentType !== expected.mediaType
      ) {
        throw new Error("Evidence object does not match its declared metadata.");
      }

      return {
        digest,
        mediaType: expected.mediaType,
        objectName,
        sizeBytes: content.byteLength,
      };
    },

    async put(tenantId, objectName, content, mediaType, expectedDigest) {
      const digest = `sha256:${createHash("sha256").update(content).digest("hex")}`;
      if (digest !== expectedDigest) throw new Error("Evidence digest does not match content.");

      await client.send(
        new PutObjectCommand({
          Body: content,
          Bucket: bucketName,
          ContentType: mediaType,
          Key: assertTenantObject(tenantId, objectName),
        }),
      );
      return { digest, mediaType, objectName, sizeBytes: content.byteLength };
    },
  };
}

function assertTenantObject(tenantId: string, objectName: string): string {
  if (!objectName.startsWith(`tenants/${tenantId}/`)) {
    throw new Error("Evidence object is outside the tenant boundary.");
  }
  return objectName;
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return candidate.name === "NotFound" || candidate.$metadata?.httpStatusCode === 404;
}
