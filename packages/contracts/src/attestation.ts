import { z } from "zod";

const sha256DigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const identifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,127}$/);

export const policyControlSchema = z
  .object({
    attestationCriterion: z.string().trim().min(1).max(1_000),
    controlId: identifierSchema,
    controlVersion: z.string().trim().min(1).max(128),
    evidenceRequirement: z.enum(["none", "reference_required", "verified_reference_required"]),
    interpretation: z.enum(["deterministic", "judgment_required"]),
    policyDocumentDigest: sha256DigestSchema,
  })
  .strict();

export const policyDefinitionSchema = z
  .object({
    controls: z.array(policyControlSchema).min(1).max(100),
    policyId: identifierSchema,
    policyVersion: z.string().trim().min(1).max(128),
    schemaVersion: z.literal("hollis.policy.v1"),
  })
  .strict()
  .superRefine((policy, context) => {
    const controls = new Set<string>();
    for (const control of policy.controls) {
      if (controls.has(control.controlId)) {
        context.addIssue({
          code: "custom",
          message: "Policy controls must have unique control IDs.",
          path: ["controls"],
        });
      }
      controls.add(control.controlId);
    }
  });

export const attestationVerdictSchema = z.enum(["pass", "fail", "needs_review", "undetermined"]);
export const attestationStatusSchema = z.enum([
  "submitted",
  "accepted",
  "appealed",
  "finalized",
  "failed",
  "undetermined",
]);

export const adjudicationEvidenceReferenceSchema = z
  .object({
    digest: sha256DigestSchema,
    mediaType: z.string().trim().min(1).max(128),
    verified: z.boolean(),
  })
  .strict();

export const adjudicationCaseFileSchema = z
  .object({
    auditManifestHash: sha256DigestSchema,
    caseCommitment: sha256DigestSchema,
    evidence: z.array(adjudicationEvidenceReferenceSchema).min(1).max(100),
    policy: z
      .object({
        control: policyControlSchema,
        policyId: identifierSchema,
        policyVersion: z.string().trim().min(1).max(128),
      })
      .strict(),
    review: z
      .object({
        decisionRecorded: z.boolean(),
        escalationRecorded: z.boolean(),
        humanDecisionOutcome: z.enum(["approved", "modified", "rejected"]).nullable(),
        reviewerActionCommitment: sha256DigestSchema,
      })
      .strict(),
    schemaVersion: z.literal("hollis.adjudication-case.v1"),
  })
  .strict();

export const genLayerAttestationRequestSchema = z
  .object({
    caseFile: adjudicationCaseFileSchema,
    idempotencyKey: sha256DigestSchema,
    publicCaseFileUrl: z.url().refine((value) => new URL(value).protocol === "https:", {
      message: "The public adjudication case file must use HTTPS.",
    }),
  })
  .strict();

export const createAttestationRequestSchema = z
  .object({
    policy: z
      .object({
        control: policyControlSchema,
        policyId: identifierSchema,
        policyVersion: z.string().trim().min(1).max(128),
      })
      .strict(),
    publicCaseFileUrl: z.url().refine((value) => new URL(value).protocol === "https:", {
      message: "The public adjudication case file must use HTTPS.",
    }),
  })
  .strict();

export const importFinalizedAttestationRequestSchema = createAttestationRequestSchema
  .extend({
    transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  })
  .strict();

export const attestationReceiptSchema = z
  .object({
    contractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    provider: z.literal("genlayer"),
    providerSubmissionId: z.string().trim().min(1).max(256),
    status: attestationStatusSchema,
    transactionHash: z
      .string()
      .regex(/^0x[a-fA-F0-9]{64}$/)
      .nullable(),
    verdict: attestationVerdictSchema.nullable(),
  })
  .strict()
  .superRefine((receipt, context) => {
    if (receipt.status === "finalized" && !receipt.verdict) {
      context.addIssue({
        code: "custom",
        message: "A finalized attestation requires a verdict.",
        path: ["verdict"],
      });
    }
  });

export const attestationRecordSchema = attestationReceiptSchema.extend({
  caseCommitment: sha256DigestSchema,
  createdAt: z.iso.datetime(),
  id: z.uuid(),
  publicCaseFileUrl: z.url(),
  updatedAt: z.iso.datetime(),
});

export type AdjudicationCaseFile = z.infer<typeof adjudicationCaseFileSchema>;
export type AttestationRecord = z.infer<typeof attestationRecordSchema>;
export type AttestationReceipt = z.infer<typeof attestationReceiptSchema>;
export type CreateAttestationRequest = z.infer<typeof createAttestationRequestSchema>;
export type ImportFinalizedAttestationRequest = z.infer<
  typeof importFinalizedAttestationRequestSchema
>;
export type GenLayerAttestationRequest = z.infer<typeof genLayerAttestationRequestSchema>;
export type PolicyDefinition = z.infer<typeof policyDefinitionSchema>;
