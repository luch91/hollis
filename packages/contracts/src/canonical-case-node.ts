import { createHash } from "node:crypto";
import {
  canonicalCaseRecordSchema,
  canonicalJson,
  canonicalReviewMetadataSchema,
  type CanonicalCaseRecord,
  type CanonicalReviewMetadata,
} from "@hollis/contracts/canonical-case";

export const commitmentDomains = {
  case: "hollis.case-commitment.v1",
  caseIdentity: "hollis.case-identity.v1",
  decisionAudit: "hollis.decision-audit.v1",
  privateReviewFacts: "hollis.private-review-facts.v1",
  reviewerAction: "hollis.reviewer-action.v1",
} as const;

export function hashCanonicalValue(domain: string, value: unknown): `sha256:${string}` {
  if (!domain.trim() || domain.includes("\n")) {
    throw new TypeError("A non-empty single-line commitment domain is required.");
  }
  return `sha256:${createHash("sha256")
    .update(`${domain}\n${canonicalJson(value)}`, "utf8")
    .digest("hex")}`;
}

export function computeCaseCommitment(record: CanonicalCaseRecord): `sha256:${string}` {
  return hashCanonicalValue(commitmentDomains.case, canonicalCaseRecordSchema.parse(record));
}

export function createCanonicalReviewMetadata(
  record: CanonicalCaseRecord,
): CanonicalReviewMetadata {
  const parsed = canonicalCaseRecordSchema.parse(record);
  return canonicalReviewMetadataSchema.parse({
    caseCommitment: computeCaseCommitment(parsed),
    commitmentVersion: "hollis.case-commitment.v1",
    record: parsed,
  });
}

export function verifyCanonicalReviewMetadata(value: unknown): CanonicalReviewMetadata {
  const parsed = canonicalReviewMetadataSchema.parse(value);
  if (computeCaseCommitment(parsed.record) !== parsed.caseCommitment) {
    throw new TypeError("The case commitment does not match the canonical record.");
  }
  return parsed;
}
