import { z } from "zod";

const sha256DigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const identifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,127}$/);

export const canonicalizationVersionSchema = z.literal("hollis.canonical-json.v1");
export const caseCommitmentVersionSchema = z.literal("hollis.case-commitment.v1");

export const canonicalCaseEvidenceSchema = z
  .object({
    digest: sha256DigestSchema,
    mediaType: z.string().trim().min(1).max(128),
    verified: z.boolean(),
  })
  .strict();

export const canonicalCaseRecordSchema = z
  .object({
    auditManifestHash: sha256DigestSchema,
    canonicalization: canonicalizationVersionSchema,
    caseIdentityCommitment: sha256DigestSchema,
    evidence: z.array(canonicalCaseEvidenceSchema).min(1).max(100),
    policy: z
      .object({
        controlId: identifierSchema,
        controlVersion: z.string().trim().min(1).max(128),
        policyDocumentDigest: sha256DigestSchema,
        policyId: identifierSchema,
        policyVersion: z.string().trim().min(1).max(128),
      })
      .strict(),
    privateReviewFactsCommitment: sha256DigestSchema,
    review: z
      .object({
        decisionRecorded: z.literal(true),
        escalationRecorded: z.boolean(),
        humanDecisionOutcome: z.enum(["approved", "modified", "rejected"]),
        reviewerActionCommitment: sha256DigestSchema,
      })
      .strict(),
    schemaVersion: z.literal("hollis.canonical-case.v1"),
  })
  .strict();

export const canonicalReviewMetadataSchema = z
  .object({
    caseCommitment: sha256DigestSchema,
    commitmentVersion: caseCommitmentVersionSchema,
    record: canonicalCaseRecordSchema,
  })
  .strict();

export type CanonicalCaseEvidence = z.infer<typeof canonicalCaseEvidenceSchema>;
export type CanonicalCaseRecord = z.infer<typeof canonicalCaseRecordSchema>;
export type CanonicalReviewMetadata = z.infer<typeof canonicalReviewMetadataSchema>;

function compareUnicodeScalars(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError("Canonical JSON permits only safe integer numbers.");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.some(([, item]) => item === undefined)) {
      throw new TypeError("Canonical JSON does not support undefined.");
    }
    entries.sort(([left], [right]) => compareUnicodeScalars(left, right));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  throw new TypeError(`Canonical JSON does not support ${typeof value}.`);
}
