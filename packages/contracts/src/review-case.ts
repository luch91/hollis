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
    reviewDueAt: z.iso.datetime(),
    ruleId: z.string().min(1).max(128),
  })
  .strict();

export const reviewCaseSchema = z
  .object({
    createdAt: z.iso.datetime(),
    externalReference: z.string(),
    id: z.uuid(),
    replayed: z.boolean(),
    reviewDueAt: z.iso.datetime().nullable(),
    status: reviewCaseStatusSchema,
  })
  .strict();

export const reviewQueueItemSchema = z
  .object({
    assignedToUserId: z.string().nullable(),
    createdAt: z.iso.datetime(),
    externalReference: z.string(),
    id: z.uuid(),
    recommendation: recommendationSchema,
    reviewDueAt: z.iso.datetime().nullable(),
    riskLevel: riskLevelSchema,
    status: reviewCaseStatusSchema,
  })
  .strict();

export const claimReviewCaseSchema = z.object({}).strict();

export const escalateReviewCaseSchema = z
  .object({
    reason: z.string().trim().min(1).max(4000),
  })
  .strict();

export const decideReviewCaseSchema = z
  .object({
    finalRecommendation: recommendationSchema,
    outcome: reviewOutcomeSchema.exclude(["escalated"]),
    rationale: z.string().trim().min(1).max(4000),
  })
  .strict();

export type CreateReviewCase = z.infer<typeof createReviewCaseSchema>;
export type ReviewCase = z.infer<typeof reviewCaseSchema>;
export type DecideReviewCase = z.infer<typeof decideReviewCaseSchema>;
export type EscalateReviewCase = z.infer<typeof escalateReviewCaseSchema>;
export type ReviewCaseStatus = z.infer<typeof reviewCaseStatusSchema>;
export type ReviewOutcome = z.infer<typeof reviewOutcomeSchema>;
export type RiskLevel = z.infer<typeof riskLevelSchema>;
