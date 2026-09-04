# v0.3.0
# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }

import json

import genlayer as gl
from genlayer.types import *


class PolicyProcessAttestationV5(gl.contract.Contract):
    attestation_criterion: str
    evaluation_reason: str
    evidence_requirement: str
    interpretation: str
    last_case_commitment: str
    policy_control_id: str
    policy_control_version: str
    policy_document_digest: str
    policy_id: str
    policy_version: str
    status: str
    verdict: str

    def __init__(
        self,
        policy_id: str,
        policy_version: str,
        policy_control_id: str,
        policy_control_version: str,
        policy_document_digest: str,
        attestation_criterion: str,
        evidence_requirement: str,
        interpretation: str,
    ):
        self.attestation_criterion = attestation_criterion
        self.evaluation_reason = "not_evaluated"
        self.evidence_requirement = evidence_requirement
        self.interpretation = interpretation
        self.last_case_commitment = ""
        self.policy_control_id = policy_control_id
        self.policy_control_version = policy_control_version
        self.policy_document_digest = policy_document_digest
        self.policy_id = policy_id
        self.policy_version = policy_version
        self.status = "submitted"
        self.verdict = "undetermined"

    @gl.public.view
    def get_evaluation_reason(self) -> str:
        return self.evaluation_reason

    @gl.public.view
    def get_last_case_commitment(self) -> str:
        return self.last_case_commitment

    @gl.public.view
    def get_status(self) -> str:
        return self.status

    @gl.public.view
    def get_verdict(self) -> str:
        return self.verdict

    def _set_undetermined(self, reason: str) -> None:
        self.evaluation_reason = reason
        self.status = "undetermined"
        self.verdict = "undetermined"

    @gl.public.write
    def adjudicate(self, case_commitment: str, public_case_file_url: str) -> None:
        def fetch_case_facts() -> str:
            response = gl.nondet.web.get(public_case_file_url)
            document = json.loads(response.body.decode("utf-8"))
            policy = document["policy"]
            control = policy["control"]
            review = document["review"]
            evidence = document["evidence"]
            return json.dumps(
                {
                    "attestationCriterion": control["attestationCriterion"],
                    "caseCommitment": document["caseCommitment"],
                    "decisionRecorded": review["decisionRecorded"],
                    "evidenceCount": len(evidence),
                    "evidenceRequirement": control["evidenceRequirement"],
                    "interpretation": control["interpretation"],
                    "policyControlId": control["controlId"],
                    "policyControlVersion": control["controlVersion"],
                    "policyDocumentDigest": control["policyDocumentDigest"],
                    "policyId": policy["policyId"],
                    "policyVersion": policy["policyVersion"],
                    "schemaVersion": document["schemaVersion"],
                    "verifiedEvidenceCount": len(
                        [item for item in evidence if item["verified"] is True]
                    ),
                },
                sort_keys=True,
            )

        facts = json.loads(gl.eq_principle.strict_eq(fetch_case_facts))
        self.last_case_commitment = case_commitment

        if facts["caseCommitment"] != case_commitment:
            self._set_undetermined("case_commitment_mismatch")
            return
        if facts["schemaVersion"] != "hollis.adjudication-case.v1":
            self._set_undetermined("schema_version_mismatch")
            return
        if facts["policyId"] != self.policy_id:
            self._set_undetermined("policy_id_mismatch")
            return
        if facts["policyVersion"] != self.policy_version:
            self._set_undetermined("policy_version_mismatch")
            return
        if facts["policyControlId"] != self.policy_control_id:
            self._set_undetermined("policy_control_id_mismatch")
            return
        if facts["policyControlVersion"] != self.policy_control_version:
            self._set_undetermined("policy_control_version_mismatch")
            return
        if facts["policyDocumentDigest"] != self.policy_document_digest:
            self._set_undetermined("policy_document_digest_mismatch")
            return
        if facts["attestationCriterion"] != self.attestation_criterion:
            self._set_undetermined("attestation_criterion_mismatch")
            return
        if facts["evidenceRequirement"] != self.evidence_requirement:
            self._set_undetermined("evidence_requirement_mismatch")
            return
        if facts["interpretation"] != self.interpretation:
            self._set_undetermined("interpretation_mismatch")
            return
        if facts["decisionRecorded"] is not True:
            self.evaluation_reason = "human_decision_missing"
            self.status = "finalized"
            self.verdict = "fail"
            return
        if self.evidence_requirement == "reference_required" and facts["evidenceCount"] < 1:
            self.evaluation_reason = "evidence_reference_missing"
            self.status = "finalized"
            self.verdict = "fail"
            return
        if (
            self.evidence_requirement == "verified_reference_required"
            and facts["verifiedEvidenceCount"] < 1
        ):
            self.evaluation_reason = "verified_evidence_reference_missing"
            self.status = "finalized"
            self.verdict = "fail"
            return
        if self.interpretation == "judgment_required":
            self.evaluation_reason = "judgment_required"
            self.status = "finalized"
            self.verdict = "needs_review"
            return

        self.evaluation_reason = "requirements_satisfied"
        self.status = "finalized"
        self.verdict = "pass"
