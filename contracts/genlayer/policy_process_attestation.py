# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json


class PolicyProcessAttestation(gl.Contract):
    case_commitment: str
    evidence_requirement: str
    interpretation: str
    policy_control_id: str
    policy_control_version: str
    policy_document_digest: str
    public_case_file_url: str
    status: str
    verdict: str

    def __init__(
        self,
        case_commitment: str,
        policy_control_id: str,
        policy_control_version: str,
        policy_document_digest: str,
        evidence_requirement: str,
        interpretation: str,
        public_case_file_url: str,
    ):
        self.case_commitment = case_commitment
        self.evidence_requirement = evidence_requirement
        self.interpretation = interpretation
        self.policy_control_id = policy_control_id
        self.policy_control_version = policy_control_version
        self.policy_document_digest = policy_document_digest
        self.public_case_file_url = public_case_file_url
        self.status = "submitted"
        self.verdict = "undetermined"

    @gl.public.view
    def get_status(self) -> str:
        return self.status

    @gl.public.view
    def get_verdict(self) -> str:
        return self.verdict

    @gl.public.write
    def adjudicate(self):
        def fetch_case_facts():
            response = gl.nondet.web.get(self.public_case_file_url)
            document = json.loads(response.body.decode("utf-8"))
            review = document["review"]
            evidence = document["evidence"]
            return json.dumps(
                {
                    "caseCommitment": document["caseCommitment"],
                    "decisionRecorded": review["decisionRecorded"],
                    "evidenceCount": len(evidence),
                    "verifiedEvidenceCount": len(
                        [item for item in evidence if item["verified"] is True]
                    ),
                },
                sort_keys=True,
            )

        agreed_facts = gl.eq_principle.strict_eq(fetch_case_facts)
        facts = json.loads(agreed_facts)

        if facts["caseCommitment"] != self.case_commitment:
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
