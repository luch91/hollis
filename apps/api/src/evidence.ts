import { evidenceReferenceSchema } from "@hollis/contracts";
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

export type EvidenceUploadResult = EvidenceUpload & {
  evidenceId: string;
  objectName: string;
  uploadUrl: string;
};

export interface EvidenceMetadataStore {
  create(
    tenantId: string,
    caseId: string,
    input: EvidenceUpload & { objectName: string },
  ): Promise<{ id: string }>;
  get(
    tenantId: string,
    caseId: string,
    evidenceId: string,
  ): Promise<{ id: string; objectName: string } | null>;
}

export async function createEvidenceUpload(
  tenantId: string,
  caseId: string,
  input: EvidenceUpload,
  storage: EvidenceStorage,
  metadata: EvidenceMetadataStore,
): Promise<EvidenceUploadResult> {
  const objectName = `tenants/${tenantId}/evidence/${input.digest.slice("sha256:".length)}`;
  const uploadUrl = await storage.createUploadUrl(tenantId, objectName, input.mediaType);
  const created = await metadata.create(tenantId, caseId, { ...input, objectName });
  return { ...input, evidenceId: created.id, objectName, uploadUrl };
}

export async function createEvidenceDownload(
  tenantId: string,
  caseId: string,
  evidenceId: string,
  storage: EvidenceStorage,
  metadata: EvidenceMetadataStore,
) {
  const object = await metadata.get(tenantId, caseId, evidenceId);
  if (!object) return null;
  return storage.createDownloadUrl(tenantId, object.objectName);
}

export function evidenceReference(input: EvidenceUpload & { id: string }) {
  return evidenceReferenceSchema.parse({
    digest: input.digest,
    id: input.id,
    mediaType: input.mediaType,
  });
}
