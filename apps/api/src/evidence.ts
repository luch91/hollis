import { evidenceReferenceSchema } from "@hollis/contracts";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { EvidenceStorage } from "./evidence-storage.js";

export const evidenceUploadSchema = z
  .object({
    digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    mediaType: z.string().min(1).max(128),
    sizeBytes: z.number().int().positive().max(524_288_000),
  })
  .strict();

export type EvidenceUpload = z.infer<typeof evidenceUploadSchema>;

export class EvidenceVerificationError extends Error {
  constructor(options?: ErrorOptions) {
    super("Evidence object does not match its declared metadata.", options);
    this.name = "EvidenceVerificationError";
  }
}

export class EvidenceUploadExpiredError extends Error {
  constructor() {
    super("Evidence upload authorization has expired.");
    this.name = "EvidenceUploadExpiredError";
  }
}

export type EvidenceUploadResult = EvidenceUpload & {
  evidenceId: string;
  objectName: string;
  expiresAt: string;
  state: "quarantined";
  uploadUrl: string;
};

export type EvidenceLifecycleRecord = {
  attempts: number;
  deletedAt: Date | null;
  deletionProviderResult: string | null;
  digest: string;
  id: string;
  lastFailure: string | null;
  legalHold: "active" | "none";
  mediaType: string;
  retentionStatus: "available" | "scheduled" | "processing" | "failed" | "dead_letter" | "deleted";
  retentionUntil: Date | null;
  verified: boolean;
};

export interface EvidenceMetadataStore {
  create(
    tenantId: string,
    caseId: string,
    input: EvidenceUpload & { expiresAt: Date; id: string; objectName: string },
  ): Promise<{ id: string }>;
  markVerified(
    tenantId: string,
    caseId: string,
    evidenceId: string,
    object: import("./evidence-storage.js").EvidenceObject,
    actorId?: string,
  ): Promise<void>;
  markFailed?(
    tenantId: string,
    caseId: string,
    evidenceId: string,
    actorId?: string,
  ): Promise<void>;
  markExpired?(
    tenantId: string,
    caseId: string,
    evidenceId: string,
    actorId?: string,
  ): Promise<void>;
  get(
    tenantId: string,
    caseId: string,
    evidenceId: string,
  ): Promise<{
    digest: string;
    id: string;
    mediaType: string;
    objectName: string;
    providerEtag?: string | null;
    providerVersion?: string | null;
    sizeBytes: number;
    verified: boolean;
    expiresAt?: Date;
    state?: "quarantined" | "verified" | "failed" | "expired" | "cleaned";
  } | null>;
  list(
    tenantId: string,
    caseId: string,
  ): Promise<Array<{ digest: string; mediaType: string; verified: boolean }>>;
  listLifecycle?(tenantId: string, caseId: string): Promise<EvidenceLifecycleRecord[]>;
  remove?(tenantId: string, caseId: string, evidenceId: string, actorId: string): Promise<boolean>;
  listExpired?(
    tenantId: string,
    limit: number,
  ): Promise<Array<{ caseId: string; evidenceId: string; objectName: string }>>;
  markQuarantineCleaned?(tenantId: string, caseId: string, evidenceId: string): Promise<void>;
}

async function cleanupExpiredEvidenceUploads(
  tenantId: string,
  storage: EvidenceStorage,
  metadata: EvidenceMetadataStore,
) {
  const expired = await metadata.listExpired?.(tenantId, 25);
  if (!expired?.length) return;
  for (const upload of expired) {
    try {
      await storage.delete(tenantId, upload.objectName);
      await metadata.markQuarantineCleaned?.(tenantId, upload.caseId, upload.evidenceId);
    } catch {
      // Leave the row available for a later bounded cleanup attempt.
    }
  }
}

export async function createEvidenceUpload(
  tenantId: string,
  caseId: string,
  input: EvidenceUpload,
  storage: EvidenceStorage,
  metadata: EvidenceMetadataStore,
): Promise<EvidenceUploadResult> {
  await cleanupExpiredEvidenceUploads(tenantId, storage, metadata);
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const objectName = `tenants/${tenantId}/evidence/quarantine/${id}`;
  const created = await metadata.create(tenantId, caseId, { ...input, expiresAt, id, objectName });
  const uploadUrl = await storage.createUploadUrl(
    tenantId,
    objectName,
    input.mediaType,
    input.sizeBytes,
    expiresAt,
  );
  return {
    ...input,
    evidenceId: created.id,
    expiresAt: expiresAt.toISOString(),
    objectName,
    state: "quarantined",
    uploadUrl,
  };
}

export async function verifyEvidenceUpload(
  tenantId: string,
  caseId: string,
  evidenceId: string,
  storage: EvidenceStorage,
  metadata: EvidenceMetadataStore,
  actorId?: string,
): Promise<boolean> {
  const object = await metadata.get(tenantId, caseId, evidenceId);
  if (!object) return false;
  if (object.verified) return true;
  if (object.state === "expired" || (object.expiresAt && object.expiresAt <= new Date())) {
    await metadata.markExpired?.(tenantId, caseId, evidenceId, actorId).catch(() => undefined);
    throw new EvidenceUploadExpiredError();
  }
  if (object.state === "failed" || object.state === "cleaned") {
    throw new EvidenceVerificationError();
  }
  try {
    const verified = await storage.verify(tenantId, object.objectName, object);
    if (
      verified.digest !== object.digest ||
      verified.mediaType !== object.mediaType ||
      verified.sizeBytes !== object.sizeBytes
    ) {
      throw new EvidenceVerificationError();
    }
    if (!storage.promote) throw new Error("Evidence storage does not support immutable promotion.");
    const immutableObject = await storage.promote(
      tenantId,
      object.objectName,
      `tenants/${tenantId}/evidence/final/${object.digest.slice("sha256:".length)}`,
    );
    if (
      immutableObject.digest !== object.digest ||
      immutableObject.sizeBytes !== object.sizeBytes
    ) {
      throw new EvidenceVerificationError();
    }
    await metadata.markVerified(tenantId, caseId, evidenceId, immutableObject, actorId);
    await Promise.resolve(storage.delete?.(tenantId, object.objectName)).catch(() => undefined);
  } catch (error) {
    await metadata.markFailed?.(tenantId, caseId, evidenceId, actorId).catch(() => undefined);
    if (error instanceof EvidenceVerificationError) throw error;
    throw new EvidenceVerificationError({ cause: error });
  }
  return true;
}

export async function createEvidenceDownload(
  tenantId: string,
  caseId: string,
  evidenceId: string,
  storage: EvidenceStorage,
  metadata: EvidenceMetadataStore,
) {
  const object = await metadata.get(tenantId, caseId, evidenceId);
  if (!object?.verified) return null;
  return storage.createDownloadUrl(tenantId, object.objectName, object.providerVersion);
}

export async function removeEvidenceAttachment(
  tenantId: string,
  caseId: string,
  evidenceId: string,
  actorId: string,
  metadata: EvidenceMetadataStore,
): Promise<boolean> {
  if (!metadata.remove) throw new Error("Evidence metadata does not support attachment removal.");
  return metadata.remove(tenantId, caseId, evidenceId, actorId);
}

export function evidenceReference(input: EvidenceUpload & { id: string }) {
  return evidenceReferenceSchema.parse({
    digest: input.digest,
    id: input.id,
    mediaType: input.mediaType,
  });
}
