import {
  type AdjudicationCaseFile,
  adjudicationCaseFileSchema,
  type CanonicalReviewMetadata,
  type CreateAttestationRequest,
  canonicalCaseRecordSchema,
  type GenLayerAttestationRequest,
  genLayerAttestationRequestSchema,
  type ReviewExport,
} from "@hollis/contracts";
import {
  commitmentDomains,
  computeCaseCommitment,
  createCanonicalReviewMetadata,
  hashCanonicalValue,
} from "@hollis/contracts/canonical-case-node";

type EvidenceForAttestation = { digest: string; mediaType: string; verified: boolean };

export class AttestationPreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttestationPreconditionError";
  }
}

export function verifyAdjudicationCaseFileIntegrity(
  value: AdjudicationCaseFile,
): AdjudicationCaseFile {
  const caseFile = adjudicationCaseFileSchema.parse(value);
  if (!caseFile.canonicalRecord) return caseFile;
  if (
    caseFile.commitmentVersion !== commitmentDomains.case ||
    computeCaseCommitment(caseFile.canonicalRecord) !== caseFile.caseCommitment
  ) {
    throw new AttestationPreconditionError(
      "The public case file canonical commitment failed integrity verification.",
    );
  }
  return caseFile;
}

function hash(value: unknown): string {
  return hashCanonicalValue("hollis.attestation-idempotency.v1", value);
}

export function buildCanonicalReviewMetadata(
  exported: ReviewExport,
  evidence: EvidenceForAttestation[],
  policy: CreateAttestationRequest["policy"],
): CanonicalReviewMetadata {
  if (
    exported.case.status !== "completed" ||
    !exported.case.decisionOutcome ||
    !exported.case.decidedAt ||
    !exported.case.decidedByUserId ||
    !exported.case.finalRecommendation
  ) {
    throw new AttestationPreconditionError(
      "Only completed cases with complete human decision facts have a canonical commitment.",
    );
  }
  if (evidence.length === 0) {
    throw new AttestationPreconditionError(
      "At least one managed evidence object is required for a canonical commitment.",
    );
  }
  if (evidence.some((item) => !item.verified)) {
    throw new AttestationPreconditionError(
      "All managed evidence must be verified for a canonical commitment.",
    );
  }

  const reviewerEvents = exported.events.filter(
    (event) => event.eventType === "review_started" || event.eventType === "decision_recorded",
  );
  const decisionEventIndex = exported.events.findLastIndex(
    (event) => event.eventType === "decision_recorded",
  );
  if (decisionEventIndex < 0) {
    throw new AttestationPreconditionError(
      "A decision audit event is required for a canonical commitment.",
    );
  }
  const decisionAuditManifest = hashCanonicalValue(commitmentDomains.decisionAudit, {
    case: exported.case,
    events: exported.events.slice(0, decisionEventIndex + 1),
  });
  const privateReviewFacts = {
    assignedAt: exported.case.assignedAt,
    assignedToUserId: exported.case.assignedToUserId,
    automatedSystemVersion: exported.case.automatedSystemVersion,
    createdAt: exported.case.createdAt,
    decidedAt: exported.case.decidedAt,
    decidedByUserId: exported.case.decidedByUserId,
    decisionRationale: exported.case.decisionRationale,
    escalatedAt: exported.case.escalatedAt,
    escalatedByUserId: exported.case.escalatedByUserId,
    escalationReason: exported.case.escalationReason,
    externalReference: exported.case.externalReference,
    finalRecommendation: exported.case.finalRecommendation,
    recommendation: exported.case.recommendation,
    reviewDueAt: exported.case.reviewDueAt,
    riskLevel: exported.case.riskLevel,
  };
  const record = canonicalCaseRecordSchema.parse({
    auditManifestHash: decisionAuditManifest,
    canonicalization: "hollis.canonical-json.v1",
    caseIdentityCommitment: hashCanonicalValue(commitmentDomains.caseIdentity, {
      hollisCaseReference: exported.case.hollisCaseReference,
      id: exported.case.id,
    }),
    evidence,
    policy: {
      controlId: policy.control.controlId,
      controlVersion: policy.control.controlVersion,
      policyDocumentDigest: policy.control.policyDocumentDigest,
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
    },
    privateReviewFactsCommitment: hashCanonicalValue(
      commitmentDomains.privateReviewFacts,
      privateReviewFacts,
    ),
    review: {
      decisionRecorded: true,
      escalationRecorded: exported.events.some((event) => event.eventType === "case_escalated"),
      humanDecisionOutcome: exported.case.decisionOutcome,
      reviewerActionCommitment: hashCanonicalValue(
        commitmentDomains.reviewerAction,
        reviewerEvents,
      ),
    },
    schemaVersion: "hollis.canonical-case.v1",
  });
  return createCanonicalReviewMetadata(record);
}

export function buildAdjudicationCaseFile(
  exported: ReviewExport,
  evidence: EvidenceForAttestation[],
  input: Pick<CreateAttestationRequest, "policy">,
): AdjudicationCaseFile {
  if (exported.case.status !== "completed" || !exported.case.decisionOutcome) {
    throw new AttestationPreconditionError(
      "Only completed cases with a recorded human decision can be attested.",
    );
  }
  if (input.policy.policyVersion !== exported.case.policyVersion) {
    throw new AttestationPreconditionError(
      "The attestation policy version does not match the review case.",
    );
  }
  if (input.policy.control.controlId !== exported.case.ruleId) {
    throw new AttestationPreconditionError(
      "The attestation control does not match the review case rule.",
    );
  }
  if (evidence.length === 0) {
    throw new AttestationPreconditionError(
      "At least one managed evidence object is required for attestation.",
    );
  }

  const canonical = buildCanonicalReviewMetadata(exported, evidence, input.policy);

  return adjudicationCaseFileSchema.parse({
    auditManifestHash: exported.manifestHash,
    canonicalRecord: canonical.record,
    caseCommitment: canonical.caseCommitment,
    commitmentVersion: canonical.commitmentVersion,
    evidence,
    policy: input.policy,
    review: {
      decisionRecorded: true,
      escalationRecorded: exported.events.some((event) => event.eventType === "case_escalated"),
      humanDecisionOutcome: exported.case.decisionOutcome,
      reviewerActionCommitment: canonical.record.review.reviewerActionCommitment,
    },
    schemaVersion: "hollis.adjudication-case.v1",
  });
}

export function buildGenLayerAttestationRequest(
  exported: ReviewExport,
  evidence: EvidenceForAttestation[],
  input: CreateAttestationRequest,
): GenLayerAttestationRequest {
  const caseFile = buildAdjudicationCaseFile(exported, evidence, input);

  return genLayerAttestationRequestSchema.parse({
    caseFile,
    idempotencyKey: hash({
      caseCommitment: caseFile.caseCommitment,
      controlId: caseFile.policy.control.controlId,
      controlVersion: caseFile.policy.control.controlVersion,
      publicCaseFileUrl: input.publicCaseFileUrl,
    }),
    publicCaseFileUrl: input.publicCaseFileUrl,
  });
}
