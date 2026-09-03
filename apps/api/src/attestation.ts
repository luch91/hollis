import {
  attestationReceiptSchema,
  genLayerAttestationRequestSchema,
  type AttestationReceipt,
  type GenLayerAttestationRequest,
} from "@hollis/contracts";

export interface AttestationProvider {
  get(providerSubmissionId: string): Promise<AttestationReceipt>;
  submit(request: GenLayerAttestationRequest): Promise<AttestationReceipt>;
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
