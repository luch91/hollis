import { DefaultAzureCredential } from "@azure/identity";
import {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
  SASProtocol,
} from "@azure/storage-blob";
import { createHash } from "node:crypto";
import type { EvidenceStorage } from "./evidence-storage.js";

const signedUrlLifetimeMilliseconds = 15 * 60 * 1000;

export function createAzureBlobEvidenceStorage(
  accountName: string,
  containerName: string,
  client = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    new DefaultAzureCredential(),
  ),
): EvidenceStorage {
  const container = client.getContainerClient(containerName);

  async function createSignedUrl(objectName: string, permissions: string): Promise<string> {
    const now = new Date();
    const startsOn = new Date(now.valueOf() - 60_000);
    const expiresOn = new Date(now.valueOf() + signedUrlLifetimeMilliseconds);
    const delegationKey = await client.getUserDelegationKey(startsOn, expiresOn);
    const token = generateBlobSASQueryParameters(
      {
        blobName: objectName,
        containerName,
        expiresOn,
        permissions: BlobSASPermissions.parse(permissions),
        protocol: SASProtocol.Https,
        startsOn,
      },
      delegationKey,
      accountName,
    ).toString();
    return `${container.getBlockBlobClient(objectName).url}?${token}`;
  }

  return {
    async createDownloadUrl(tenantId, objectName) {
      const name = assertTenantObject(tenantId, objectName);
      return createSignedUrl(name, "r");
    },

    async createUploadUrl(tenantId, objectName) {
      const name = assertTenantObject(tenantId, objectName);
      if (await container.getBlockBlobClient(name).exists()) return "";
      return createSignedUrl(name, "cw");
    },

    async delete(tenantId, objectName) {
      await container.getBlockBlobClient(assertTenantObject(tenantId, objectName)).deleteIfExists();
    },

    async verify(tenantId, objectName, expected) {
      const name = assertTenantObject(tenantId, objectName);
      const blob = container.getBlockBlobClient(name);
      const properties = await blob.getProperties();
      const content = await blob.downloadToBuffer();
      const digest = `sha256:${createHash("sha256").update(content).digest("hex")}`;
      if (
        digest !== expected.digest ||
        properties.contentLength !== expected.sizeBytes ||
        properties.contentType !== expected.mediaType
      ) {
        throw new Error("Evidence object does not match its declared metadata.");
      }
      return { digest, mediaType: expected.mediaType, objectName, sizeBytes: content.byteLength };
    },

    async put(tenantId, objectName, content, mediaType, expectedDigest) {
      const digest = `sha256:${createHash("sha256").update(content).digest("hex")}`;
      if (digest !== expectedDigest) throw new Error("Evidence digest does not match content.");
      await container
        .getBlockBlobClient(assertTenantObject(tenantId, objectName))
        .uploadData(content, { blobHTTPHeaders: { blobContentType: mediaType } });
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
