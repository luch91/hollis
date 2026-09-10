import { Storage } from "@google-cloud/storage";
import { GoogleAuth, Impersonated } from "google-auth-library";
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
}

export function evidenceObjectName(tenantId: string, digest: string): string {
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid evidence digest.");
  return `tenants/${tenantId}/evidence/${digest.slice("sha256:".length)}`;
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
    async createDownloadUrl(tenantId, objectName) {
      const [url] = await (await resolveBucket())
        .file(assertTenantObject(tenantId, objectName))
        .getSignedUrl({ ...signedUrlOptions(), action: "read" });
      return url;
    },
    async createUploadUrl(tenantId, objectName, mediaType) {
      const file = (await resolveBucket()).file(assertTenantObject(tenantId, objectName));
      const [exists] = await file.exists();
      if (exists) return "";
      const [url] = await file.getSignedUrl({
        ...signedUrlOptions(),
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
      const [content] = await file.download();
      const digest = `sha256:${createHash("sha256").update(content).digest("hex")}`;
      if (
        digest !== expected.digest ||
        Number(metadata.size) !== expected.sizeBytes ||
        metadata.contentType !== expected.mediaType
      ) {
        throw new Error("Evidence object does not match its declared metadata.");
      }
      return { digest, mediaType: expected.mediaType, objectName, sizeBytes: content.byteLength };
    },
    async put(tenantId, objectName, content, mediaType, expectedDigest) {
      const digest = `sha256:${createHash("sha256").update(content).digest("hex")}`;
      if (digest !== expectedDigest) throw new Error("Evidence digest does not match content.");
      const file = (await resolveBucket()).file(assertTenantObject(tenantId, objectName));
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
