import { z } from "zod";
import { policyControlSchema } from "./attestation.js";

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const transactionHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);

export const policyContractBindingSchema = z
  .object({
    control: policyControlSchema,
    policyId: z.string().regex(/^[a-z][a-z0-9-]{0,127}$/),
    policyVersion: z.string().trim().min(1).max(128),
  })
  .strict();

export const policyContractDeploymentStatusSchema = z.enum([
  "pending",
  "submitting",
  "submitted",
  "finalized",
  "verified",
  "active",
  "failed",
  "binding_mismatch",
  "superseded",
]);

export const policyContractDeploymentSchema = z
  .object({
    activatedAt: z.iso.datetime().nullable(),
    binding: policyContractBindingSchema,
    bindingDigest: digestSchema,
    contractAddress: addressSchema.nullable(),
    createdAt: z.iso.datetime(),
    createdByUserId: z.uuid(),
    deploymentTransactionHash: transactionHashSchema.nullable(),
    failureCode: z.string().trim().min(1).max(128).nullable(),
    finalizedAt: z.iso.datetime().nullable(),
    id: z.uuid(),
    network: z.literal("studio-dev"),
    networkChainId: z.literal(61997),
    policyControlRecordId: z.uuid(),
    runtimeAddress: addressSchema,
    sourceDigest: digestSchema,
    sourceVersion: z.string().trim().min(1).max(32),
    status: policyContractDeploymentStatusSchema,
    tenantId: z.uuid(),
    updatedAt: z.iso.datetime(),
    verifiedAt: z.iso.datetime().nullable(),
  })
  .strict();

export type PolicyContractBinding = z.infer<typeof policyContractBindingSchema>;
export type PolicyContractDeployment = z.infer<typeof policyContractDeploymentSchema>;
export type PolicyContractDeploymentStatus = z.infer<typeof policyContractDeploymentStatusSchema>;
