import { z } from "zod";
import { attestationVerdictSchema } from "./attestation.js";

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const transactionHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);

export const managedAttestationSubmissionStatusSchema = z.enum([
  "pending",
  "submitting",
  "submitted",
  "finalized",
  "failed",
  "reconciliation_required",
]);

export const managedAttestationSubmissionSchema = z
  .object({
    caseCommitment: digestSchema,
    caseId: z.uuid(),
    contractAddress: addressSchema,
    createdAt: z.iso.datetime(),
    deploymentId: z.uuid(),
    evaluationReason: z.string().trim().min(1).max(128).nullable(),
    failureCode: z.string().trim().min(1).max(128).nullable(),
    finalizedAt: z.iso.datetime().nullable(),
    id: z.uuid(),
    idempotencyKey: digestSchema,
    publicCaseFileUrl: z.url().refine((value) => new URL(value).protocol === "https:"),
    runtimeAddress: addressSchema,
    status: managedAttestationSubmissionStatusSchema,
    tenantId: z.uuid(),
    transactionHash: transactionHashSchema.nullable(),
    updatedAt: z.iso.datetime(),
    verdict: attestationVerdictSchema.nullable(),
  })
  .strict();

export type ManagedAttestationSubmission = z.infer<typeof managedAttestationSubmissionSchema>;
export type ManagedAttestationSubmissionStatus = z.infer<
  typeof managedAttestationSubmissionStatusSchema
>;
