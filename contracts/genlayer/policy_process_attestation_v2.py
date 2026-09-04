# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json


class PolicyProcessAttestationV2(gl.Contract):
    attestation_criterion: str
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
    def get_last_case_commitment(self) -> str:
        return self.last_case_commitment

    @gl.public.view
    def get_status(self) -> str:
        return self.status

    @gl.public.view
    def get_verdict(self) -> str:
        return self.verdict

    @gl.public.write
    def adjudicate(self, case_commitment: str, public_case_file_url: str):
        def fetch_case_facts():
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

        agreed_facts = gl.eq_principle.strict_eq(fetch_case_facts)
        facts = json.loads(agreed_facts)
        self.last_case_commitment = case_commitment

        if facts["caseCommitment"] != case_commitment:
            self.status = "undetermined"
            self.verdict = "undetermined"
            return

        if (
            facts["schemaVersion"] != "hollis.adjudication-case.v1"
            or facts["policyId"] != self.policy_id
            or facts["policyVersion"] != self.policy_version
            or facts["policyControlId"] != self.policy_control_id
            or facts["policyControlVersion"] != self.policy_control_version
            or facts["policyDocumentDigest"] != self.policy_document_digest
            or facts["attestationCriterion"] != self.attestation_criterion
            or facts["evidenceRequirement"] != self.evidence_requirement
            or facts["interpretation"] != self.interpretation
        ):
            self.status = "undetermined"
            self.verdict = "undetermined"
            return

        if facts["decisionRecorded"] is not True:
            self.status = "finalized"
            self.verdict = "fail"
            return

        if self.evidence_requirement == "reference_required" and facts["evidenceCount"] < 1:
            self.status = "finalized"
            self.verdict = "fail"
            return

        if (
            self.evidence_requirement == "verified_reference_required"
            and facts["verifiedEvidenceCount"] < 1
        ):
            self.status = "finalized"
            self.verdict = "fail"
            return

        if self.interpretation == "judgment_required":
            self.status = "finalized"
            self.verdict = "needs_review"
            return

        self.status = "finalized"
        self.verdict = "pass"
