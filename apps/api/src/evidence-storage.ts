import { Storage } from "@google-cloud/storage";
import { GoogleAuth, Impersonated } from "google-auth-library";
import { createHash } from "node:crypto";

export type EvidenceObject = {
  digest: string;
  mediaType: string;
  objectName: string;
  providerEtag?: string | null;
  providerVersion?: string | null;
  sizeBytes: number;
};

export interface EvidenceStorage {
  createDownloadUrl(
    tenantId: string,
    objectName: string,
    providerVersion?: string | null,
  ): Promise<string>;
  createUploadUrl(
    tenantId: string,
    objectName: string,
    mediaType: string,
    sizeBytes?: number,
    expiresAt?: Date,
  ): Promise<string>;
  delete(tenantId: string, objectName: string): Promise<void>;
  verify(
    tenantId: string,
    objectName: string,
    expected: { digest: string; mediaType: string; sizeBytes: number },
  ): Promise<EvidenceObject>;
  put(
    tenantId: string,
    objectName: string,
    content: Buffer,
    mediaType: string,
    expectedDigest: string,
  ): Promise<EvidenceObject>;
  promote?(
    tenantId: string,
    quarantineObjectName: string,
    immutableObjectName: string,
  ): Promise<EvidenceObject>;
}

export function evidenceObjectName(tenantId: string, digest: string): string {
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid evidence digest.");
  return `tenants/${tenantId}/evidence/final/${digest.slice("sha256:".length)}`;
}

export async function createGoogleCloudEvidenceStorage(
  projectId: string,
  bucketName: string,
): Promise<EvidenceStorage> {
  const sourceAuth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  let bucketPromise: Promise<ReturnType<Storage["bucket"]>> | undefined;

  function resolveBucket() {
    bucketPromise ??= (async () => {
      const sourceClient = await sourceAuth.getClient();
      const signer = new Impersonated({
        sourceClient,
        targetPrincipal:
          process.env.GCS_SIGNER_SERVICE_ACCOUNT ??
          "hollis-evidence-runtime@hollis-507001.iam.gserviceaccount.com",
        targetScopes: ["https://www.googleapis.com/auth/cloud-platform"],
        lifetime: 900,
      });
      return new Storage({ projectId, authClient: signer }).bucket(bucketName);
    })();
    return bucketPromise;
  }

  const signedUrlOptions = () => ({
    version: "v4" as const,
    expires: Date.now() + 15 * 60 * 1000,
  });

  return {
    async createDownloadUrl(tenantId, objectName, providerVersion) {
      const [url] = await (await resolveBucket())
        .file(
          assertTenantObject(tenantId, objectName),
          providerVersion ? { generation: providerVersion } : undefined,
        )
        .getSignedUrl({ ...signedUrlOptions(), action: "read" });
      return url;
    },
    async createUploadUrl(tenantId, objectName, mediaType, _sizeBytes, expiresAt) {
      const file = (await resolveBucket()).file(assertTenantObject(tenantId, objectName));
      const [exists] = await file.exists();
      if (exists) return "";
      const [url] = await file.getSignedUrl({
        ...signedUrlOptions(),
        expires: expiresAt?.valueOf() ?? Date.now() + 15 * 60 * 1000,
        action: "write",
        contentType: mediaType,
      });
      return url;
    },
    async delete(tenantId, objectName) {
      await (await resolveBucket())
        .file(assertTenantObject(tenantId, objectName))
        .delete({ ignoreNotFound: true });
    },
    async verify(tenantId, objectName, expected) {
      const file = (await resolveBucket()).file(assertTenantObject(tenantId, objectName));
      const [metadata] = await file.getMetadata();
      if (Number(metadata.size) > expected.sizeBytes)
        throw new Error("Evidence object is oversized.");
      const hash = createHash("sha256");
      let received = 0;
      await new Promise<void>((resolve, reject) => {
        const stream = file.createReadStream();
        stream.on("data", (chunk: Buffer) => {
          received += chunk.byteLength;
          if (received > expected.sizeBytes) {
            stream.destroy(new Error("Evidence object is oversized."));
            return;
          }
          hash.update(chunk);
        });
        stream.on("end", resolve);
        stream.on("error", reject);
      });
      const digest = `sha256:${hash.digest("hex")}`;
      if (
        digest !== expected.digest ||
        received !== expected.sizeBytes ||
        metadata.contentType !== expected.mediaType
      ) {
        throw new Error("Evidence object does not match its declared metadata.");
      }
      return {
        digest,
        mediaType: expected.mediaType,
        objectName,
        providerEtag: metadata.etag ?? null,
        providerVersion: metadata.generation?.toString() ?? null,
        sizeBytes: received,
      };
    },
    async put(tenantId, objectName, content, mediaType, expectedDigest) {
      const digest = `sha256:${createHash("sha256").update(content).digest("hex")}`;
      if (digest !== expectedDigest) throw new Error("Evidence digest does not match content.");
      const file = (await resolveBucket()).file(assertTenantObject(tenantId, objectName));
      await file.save(content, { contentType: mediaType, resumable: false, validation: "md5" });
      return { digest, mediaType, objectName, sizeBytes: content.byteLength };
    },
    async promote(tenantId, quarantineObjectName, immutableObjectName) {
      const bucket = await resolveBucket();
      const source = bucket.file(assertTenantObject(tenantId, quarantineObjectName));
      const destination = bucket.file(assertTenantObject(tenantId, immutableObjectName));
      const [exists] = await destination.exists();
      if (!exists) {
        await source.copy(destination, { preconditionOpts: { ifGenerationMatch: 0 } });
      }
      const [metadata] = await destination.getMetadata();
      return {
        digest: `sha256:${immutableObjectName.split("/").at(-1)}`,
        mediaType: metadata.contentType ?? "application/octet-stream",
        objectName: immutableObjectName,
        providerEtag: metadata.etag ?? null,
        providerVersion: metadata.generation?.toString() ?? null,
        sizeBytes: Number(metadata.size),
      };
    },
  };
}

function assertTenantObject(tenantId: string, objectName: string): string {
  if (!objectName.startsWith(`tenants/${tenantId}/`))
    throw new Error("Evidence object is outside the tenant boundary.");
  return objectName;
}
