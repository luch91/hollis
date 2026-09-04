import {
  adjudicationCaseFileSchema,
  genLayerAttestationRequestSchema,
  type CreateAttestationRequest,
  type CreatePublicAttestationCaseFileRequest,
  type AdjudicationCaseFile,
  type GenLayerAttestationRequest,
  type ReviewExport,
} from "@hollis/contracts";
import { createHash } from "node:crypto";

type EvidenceForAttestation = { digest: string; mediaType: string; verified: boolean };

export class AttestationPreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttestationPreconditionError";
  }
}

function hash(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

export function buildAdjudicationCaseFile(
  exported: ReviewExport,
  evidence: EvidenceForAttestation[],
  input: CreateAttestationRequest | CreatePublicAttestationCaseFileRequest,
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

  return adjudicationCaseFileSchema.parse({
    auditManifestHash: exported.manifestHash,
    caseCommitment: exported.manifestHash,
    evidence,
    policy: input.policy,
    review: {
      decisionRecorded: true,
      escalationRecorded: exported.events.some((event) => event.eventType === "case_escalated"),
      humanDecisionOutcome: exported.case.decisionOutcome,
      reviewerActionCommitment: hash(
        exported.events.filter(
          (event) =>
            event.eventType === "review_started" || event.eventType === "decision_recorded",
        ),
      ),
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
