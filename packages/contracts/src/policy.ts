import { z } from "zod";

export const policyEvidenceRequirementSchema = z.enum([
  "none",
  "reference_required",
  "verified_reference_required",
]);

export const policyInterpretationSchema = z.enum(["deterministic", "judgment_required"]);

export const policySourceMediaTypeSchema = z.enum([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/markdown",
  "text/plain",
]);

export const policySourceSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    mediaType: policySourceMediaTypeSchema,
    sizeBytes: z.number().int().positive().max(5_242_880),
  })
  .strict();

export const policyLibraryControlSchema = z
  .object({
    attestationCriterion: z.string().trim().min(1).max(1000),
    controlId: z.string().trim().min(1).max(128),
    controlVersion: z.string().trim().min(1).max(128),
    evidenceRequirement: policyEvidenceRequirementSchema,
    interpretation: policyInterpretationSchema,
    title: z.string().trim().min(1).max(160),
  })
  .strict();

export const createPolicyVersionSchema = z
  .object({
    controls: z.array(policyLibraryControlSchema).min(1).max(100),
    documentDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    policyId: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9-]{0,127}$/),
    title: z.string().trim().min(1).max(160),
    source: policySourceSchema,
    version: z.string().trim().min(1).max(128),
  })
  .strict();

export const policyVersionSchema = createPolicyVersionSchema
  .extend({
    createdAt: z.iso.datetime(),
    createdByUserId: z.uuid(),
    id: z.uuid(),
    publishedAt: z.iso.datetime(),
  })
  .extend({ source: policySourceSchema.nullable().optional() });

export type CreatePolicyVersion = z.infer<typeof createPolicyVersionSchema>;
export type PolicyControl = z.infer<typeof policyLibraryControlSchema>;
export type PolicyVersion = z.infer<typeof policyVersionSchema>;
