# v0.3.0
# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }

import json

import genlayer as gl
from genlayer.storage.tree_map import TreeMap
from genlayer.types import *


class PolicyProcessAttestationV6(gl.contract.Contract):
    attestation_criterion: str
    evaluation_reasons: TreeMap[str, str]
    evidence_requirement: str
    interpretation: str
    policy_control_id: str
    policy_control_version: str
    policy_document_digest: str
    policy_id: str
    policy_version: str
    statuses: TreeMap[str, str]
    verdicts: TreeMap[str, str]

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
        self.evaluation_reasons = gl.storage.inmem_allocate(TreeMap[str, str])
        self.evidence_requirement = evidence_requirement
        self.interpretation = interpretation
        self.policy_control_id = policy_control_id
        self.policy_control_version = policy_control_version
        self.policy_document_digest = policy_document_digest
        self.policy_id = policy_id
        self.policy_version = policy_version
        self.statuses = gl.storage.inmem_allocate(TreeMap[str, str])
        self.verdicts = gl.storage.inmem_allocate(TreeMap[str, str])

    @gl.public.view
    def get_evaluation_reason(self, case_commitment: str) -> str:
        return self.evaluation_reasons.get(case_commitment, "not_found")

    @gl.public.view
    def get_status(self, case_commitment: str) -> str:
        return self.statuses.get(case_commitment, "not_found")

    @gl.public.view
    def get_verdict(self, case_commitment: str) -> str:
        return self.verdicts.get(case_commitment, "not_found")

    def _record(self, case_commitment: str, status: str, verdict: str, reason: str) -> None:
        self.evaluation_reasons[case_commitment] = reason
        self.statuses[case_commitment] = status
        self.verdicts[case_commitment] = verdict

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

        if facts["caseCommitment"] != case_commitment:
            self._record(case_commitment, "undetermined", "undetermined", "case_commitment_mismatch")
            return
        if facts["schemaVersion"] != "hollis.adjudication-case.v1":
            self._record(case_commitment, "undetermined", "undetermined", "schema_version_mismatch")
            return
        if facts["policyId"] != self.policy_id:
            self._record(case_commitment, "undetermined", "undetermined", "policy_id_mismatch")
            return
        if facts["policyVersion"] != self.policy_version:
            self._record(case_commitment, "undetermined", "undetermined", "policy_version_mismatch")
            return
        if facts["policyControlId"] != self.policy_control_id:
            self._record(case_commitment, "undetermined", "undetermined", "policy_control_id_mismatch")
            return
        if facts["policyControlVersion"] != self.policy_control_version:
            self._record(
                case_commitment,
                "undetermined",
                "undetermined",
                "policy_control_version_mismatch",
            )
            return
        if facts["policyDocumentDigest"] != self.policy_document_digest:
            self._record(
                case_commitment,
                "undetermined",
                "undetermined",
                "policy_document_digest_mismatch",
            )
            return
        if facts["attestationCriterion"] != self.attestation_criterion:
            self._record(
                case_commitment,
                "undetermined",
                "undetermined",
                "attestation_criterion_mismatch",
            )
            return
        if facts["evidenceRequirement"] != self.evidence_requirement:
            self._record(
                case_commitment,
                "undetermined",
                "undetermined",
                "evidence_requirement_mismatch",
            )
            return
        if facts["interpretation"] != self.interpretation:
            self._record(case_commitment, "undetermined", "undetermined", "interpretation_mismatch")
            return
        if facts["decisionRecorded"] is not True:
            self._record(case_commitment, "finalized", "fail", "human_decision_missing")
            return
        if self.evidence_requirement == "reference_required" and facts["evidenceCount"] < 1:
            self._record(case_commitment, "finalized", "fail", "evidence_reference_missing")
            return
        if (
            self.evidence_requirement == "verified_reference_required"
            and facts["verifiedEvidenceCount"] < 1
        ):
            self._record(
                case_commitment,
                "finalized",
                "fail",
                "verified_evidence_reference_missing",
            )
            return
        if self.interpretation == "judgment_required":
            self._record(case_commitment, "finalized", "needs_review", "judgment_required")
            return

        self._record(case_commitment, "finalized", "pass", "requirements_satisfied")
