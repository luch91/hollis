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

  async function createSignedUrl(
    objectName: string,
    permissions: string,
    providerVersion?: string | null,
  ): Promise<string> {
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
    const blob = container.getBlockBlobClient(objectName);
    return `${providerVersion ? blob.withVersion(providerVersion).url : blob.url}?${token}`;
  }

  return {
    async createDownloadUrl(tenantId, objectName, providerVersion) {
      const name = assertTenantObject(tenantId, objectName);
      return createSignedUrl(name, "r", providerVersion);
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
      if ((properties.contentLength ?? 0) > expected.sizeBytes) {
        throw new Error("Evidence object is oversized.");
      }
      const response = await blob.download();
      if (!response.readableStreamBody) throw new Error("Evidence object has no content.");
      const hash = createHash("sha256");
      let received = 0;
      for await (const chunk of response.readableStreamBody as AsyncIterable<Uint8Array>) {
        received += chunk.byteLength;
        if (received > expected.sizeBytes) throw new Error("Evidence object is oversized.");
        hash.update(chunk);
      }
      const digest = `sha256:${hash.digest("hex")}`;
      if (
        digest !== expected.digest ||
        received !== expected.sizeBytes ||
        properties.contentType !== expected.mediaType
      ) {
        throw new Error("Evidence object does not match its declared metadata.");
      }
      return {
        digest,
        mediaType: expected.mediaType,
        objectName,
        providerEtag: properties.etag ?? null,
        providerVersion: properties.versionId ?? null,
        sizeBytes: received,
      };
    },

    async put(tenantId, objectName, content, mediaType, expectedDigest) {
      const digest = `sha256:${createHash("sha256").update(content).digest("hex")}`;
      if (digest !== expectedDigest) throw new Error("Evidence digest does not match content.");
      await container
        .getBlockBlobClient(assertTenantObject(tenantId, objectName))
        .uploadData(content, { blobHTTPHeaders: { blobContentType: mediaType } });
      return { digest, mediaType, objectName, sizeBytes: content.byteLength };
    },
    async promote(tenantId, quarantineObjectName, immutableObjectName) {
      const sourceName = assertTenantObject(tenantId, quarantineObjectName);
      const destinationName = assertTenantObject(tenantId, immutableObjectName);
      const destination = container.getBlockBlobClient(destinationName);
      if (!(await destination.exists())) {
        const sourceUrl = await createSignedUrl(sourceName, "r");
        const poller = await destination.beginCopyFromURL(sourceUrl, {
          conditions: { ifNoneMatch: "*" },
        });
        await poller.pollUntilDone();
      }
      const properties = await destination.getProperties();
      return {
        digest: `sha256:${destinationName.split("/").at(-1)}`,
        mediaType: properties.contentType ?? "application/octet-stream",
        objectName: destinationName,
        providerEtag: properties.etag ?? null,
        providerVersion: properties.versionId ?? null,
        sizeBytes: properties.contentLength ?? 0,
      };
    },
  };
}

function assertTenantObject(tenantId: string, objectName: string): string {
  if (!objectName.startsWith(`tenants/${tenantId}/`)) {
    throw new Error("Evidence object is outside the tenant boundary.");
  }
  return objectName;
}
