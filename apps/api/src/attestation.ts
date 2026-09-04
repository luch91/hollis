import {
  attestationReceiptSchema,
  attestationRecordSchema,
  genLayerAttestationRequestSchema,
  type AdjudicationCaseFile,
  type AttestationRecord,
  type AttestationReceipt,
  type GenLayerAttestationRequest,
  type PublicAttestationCaseFile,
} from "@hollis/contracts";

export interface AttestationProvider {
  get(providerSubmissionId: string): Promise<AttestationReceipt>;
  submit(request: GenLayerAttestationRequest): Promise<AttestationReceipt>;
}

export interface FinalizedAttestationImporter {
  importFinalized(input: {
    caseFile: GenLayerAttestationRequest["caseFile"];
    publicCaseFileUrl: string;
    transactionHash: string;
  }): Promise<AttestationReceipt>;
}

export interface AttestationStore {
  create(
    tenantId: string,
    caseId: string,
    actorId: string,
    caseFile: AdjudicationCaseFile,
    publicCaseFileUrl: string,
    receipt: AttestationReceipt,
  ): Promise<AttestationRecord>;
  list(tenantId: string, caseId: string): Promise<AttestationRecord[]>;
  update(
    tenantId: string,
    caseId: string,
    attestationId: string,
    receipt: AttestationReceipt,
  ): Promise<AttestationRecord | null>;
}

export interface PublicAttestationCaseFileStore {
  create(
    tenantId: string,
    caseId: string,
    actorId: string,
    publicId: string,
    caseFile: AdjudicationCaseFile,
    publicCaseFileUrl: string,
  ): Promise<PublicAttestationCaseFile>;
  findForCase(
    tenantId: string,
    caseId: string,
    publicId: string,
    publicCaseFileUrl: string,
  ): Promise<PublicAttestationCaseFile | null>;
  findPublic(
    publicId: string,
    publicCaseFileUrl: string,
  ): Promise<PublicAttestationCaseFile | null>;
  list(
    tenantId: string,
    caseId: string,
    publicOrigin: string,
  ): Promise<PublicAttestationCaseFile[]>;
}

export interface GenLayerIntelligentContractClient {
  getPolicyProcessAttestation(providerSubmissionId: string): Promise<unknown>;
  submitPolicyProcessAttestation(input: {
    attestationCriterion: string;
    caseCommitment: string;
    evidenceRequirement: "none" | "reference_required" | "verified_reference_required";
    idempotencyKey: string;
    interpretation: "deterministic" | "judgment_required";
    policyControlId: string;
    policyControlVersion: string;
    policyDocumentDigest: string;
    publicCaseFileUrl: string;
  }): Promise<unknown>;
}

export class GenLayerAttestationProvider implements AttestationProvider {
  constructor(private readonly client: GenLayerIntelligentContractClient) {}

  async submit(request: GenLayerAttestationRequest): Promise<AttestationReceipt> {
    const input = genLayerAttestationRequestSchema.parse(request);
    const receipt = await this.client.submitPolicyProcessAttestation({
      attestationCriterion: input.caseFile.policy.control.attestationCriterion,
      caseCommitment: input.caseFile.caseCommitment,
      evidenceRequirement: input.caseFile.policy.control.evidenceRequirement,
      idempotencyKey: input.idempotencyKey,
      interpretation: input.caseFile.policy.control.interpretation,
      policyControlId: input.caseFile.policy.control.controlId,
      policyControlVersion: input.caseFile.policy.control.controlVersion,
      policyDocumentDigest: input.caseFile.policy.control.policyDocumentDigest,
      publicCaseFileUrl: input.publicCaseFileUrl,
    });
    return attestationReceiptSchema.parse(receipt);
  }

  async get(providerSubmissionId: string): Promise<AttestationReceipt> {
    return attestationReceiptSchema.parse(
      await this.client.getPolicyProcessAttestation(providerSubmissionId),
    );
  }
}

export function parseAttestationRecord(value: unknown): AttestationRecord {
  return attestationRecordSchema.parse(value);
}
