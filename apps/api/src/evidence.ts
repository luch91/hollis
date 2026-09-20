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

export type EvidenceUploadResult = EvidenceUpload & {
  evidenceId: string;
  objectName: string;
  expiresAt: string;
  state: "quarantined";
  uploadUrl: string;
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
  } | null>;
  list(
    tenantId: string,
    caseId: string,
  ): Promise<Array<{ digest: string; mediaType: string; verified: boolean }>>;
  remove?(
    tenantId: string,
    caseId: string,
    evidenceId: string,
    actorId: string,
  ): Promise<boolean>;
}

export async function createEvidenceUpload(
  tenantId: string,
  caseId: string,
  input: EvidenceUpload,
  storage: EvidenceStorage,
  metadata: EvidenceMetadataStore,
): Promise<EvidenceUploadResult> {
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
  try {
    const verified = await storage.verify(tenantId, object.objectName, object);
    if (!storage.promote) throw new Error("Evidence storage does not support immutable promotion.");
    const immutableObject = await storage.promote(
      tenantId,
      object.objectName,
      `tenants/${tenantId}/evidence/final/${object.digest.slice("sha256:".length)}`,
    );
    if (immutableObject.digest !== object.digest || immutableObject.sizeBytes !== object.sizeBytes) {
      throw new EvidenceVerificationError();
    }
    await metadata.markVerified(tenantId, caseId, evidenceId, immutableObject, actorId);
    await Promise.resolve(storage.delete?.(tenantId, object.objectName)).catch(() => undefined);
  } catch (error) {
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
