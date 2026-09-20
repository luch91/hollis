import { z } from "zod";
import { canonicalReviewMetadataSchema } from "@hollis/contracts/canonical-case";

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
    policyId: z
      .string()
      .regex(/^[a-z][a-z0-9-]{0,127}$/)
      .optional(),
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
    hollisCaseReference: z.string().regex(/^HL-\d{2}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/),
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
    hollisCaseReference: z.string().regex(/^HL-\d{2}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/),
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

export const reviewExportEventSchema = z
  .object({
    actorId: z.string(),
    createdAt: z.iso.datetime(),
    eventHash: z.string(),
    eventSequence: z.number().int().positive(),
    eventType: z.string(),
    payload: z.unknown(),
    previousHash: z.string().nullable(),
  })
  .strict();

export const reviewExportSchema = z
  .object({
    canonical: canonicalReviewMetadataSchema.optional(),
    case: reviewQueueItemSchema.extend({
      assignedAt: z.iso.datetime().nullable(),
      automatedSystemVersion: z.string(),
      decisionOutcome: reviewOutcomeSchema.exclude(["escalated"]).nullable(),
      decisionRationale: z.string().nullable(),
      decidedAt: z.iso.datetime().nullable(),
      decidedByUserId: z.string().nullable(),
      evidence: evidenceReferenceSchema.array(),
      escalatedAt: z.iso.datetime().nullable(),
      escalatedByUserId: z.string().nullable(),
      escalationReason: z.string().nullable(),
      finalRecommendation: recommendationSchema.nullable(),
      policyId: z.string().nullable().optional(),
      policyVersion: z.string(),
      ruleId: z.string(),
    }),
    events: reviewExportEventSchema.array(),
    manifestHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    schemaVersion: z.literal("hollis.review-export.v1"),
  })
  .strict();

export const reviewExportIdentityLabelsSchema = z
  .object({
    identities: z.array(
      z
        .object({
          actorId: z.string().min(1),
          displayName: z.string().trim().min(1),
        })
        .strict(),
    ),
  })
  .strict();

export type CreateReviewCase = z.infer<typeof createReviewCaseSchema>;
export type ReviewCase = z.infer<typeof reviewCaseSchema>;
export type DecideReviewCase = z.infer<typeof decideReviewCaseSchema>;
export type EscalateReviewCase = z.infer<typeof escalateReviewCaseSchema>;
export type ReviewCaseStatus = z.infer<typeof reviewCaseStatusSchema>;
export type ReviewOutcome = z.infer<typeof reviewOutcomeSchema>;
export type RiskLevel = z.infer<typeof riskLevelSchema>;
export type ReviewExport = z.infer<typeof reviewExportSchema>;
export type ReviewExportIdentityLabels = z.infer<typeof reviewExportIdentityLabelsSchema>;
