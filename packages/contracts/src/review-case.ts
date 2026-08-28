import { z } from "zod";

export const riskLevelSchema = z.enum(["low", "medium", "high", "critical"]);

export const recommendationSchema = z.enum([
  "approve",
  "partial_approve",
  "deny",
  "refer",
  "investigate",
]);

export const reviewOutcomeSchema = z.enum(["approved", "modified", "rejected", "escalated"]);
export const reviewCaseStatusSchema = z.enum(["pending", "in_review", "completed", "escalated"]);

export const evidenceReferenceSchema = z
  .object({
    digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    id: z.string().min(1).max(128),
    mediaType: z.string().min(1).max(128),
  })
  .strict();

export const createReviewCaseSchema = z
  .object({
    automatedSystemVersion: z.string().min(1).max(128),
    evidence: z.array(evidenceReferenceSchema).min(1).max(100),
    externalReference: z.string().min(1).max(128),
    policyVersion: z.string().min(1).max(128),
    recommendation: recommendationSchema,
    riskLevel: riskLevelSchema,
    ruleId: z.string().min(1).max(128),
  })
  .strict();

export const reviewCaseSchema = z
  .object({
    createdAt: z.iso.datetime(),
    externalReference: z.string(),
    id: z.uuid(),
    replayed: z.boolean(),
    status: reviewCaseStatusSchema,
  })
  .strict();

export type CreateReviewCase = z.infer<typeof createReviewCaseSchema>;
export type ReviewCase = z.infer<typeof reviewCaseSchema>;
export type ReviewOutcome = z.infer<typeof reviewOutcomeSchema>;
export type RiskLevel = z.infer<typeof riskLevelSchema>;
