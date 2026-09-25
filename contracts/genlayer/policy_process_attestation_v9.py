# v0.3.0
# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }

"""V9: authorized, canonical-record-bound, single-finality policy attestation.

V8 and earlier versions are retained only for historical reads. New deployments must use this
contract: it accepts writes only from the configured Hollis runtime account,
computes the canonical V1 commitment itself, and never overwrites a result.
"""

import hashlib
import json
from urllib.parse import urlparse

import genlayer as gl
from genlayer.storage.tree_map import TreeMap
from genlayer.types import *


MAX_DOCUMENT_BYTES = 262144
COMMITMENT_PREFIX = "hollis.case-commitment.v1\n"


def reject_duplicate_keys(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("duplicate_key")
        value[key] = item
    return value


def canonical_json(value):
    if value is None or isinstance(value, bool) or isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, int):
        return str(value)
    if isinstance(value, list):
        return "[" + ",".join(canonical_json(item) for item in value) + "]"
    if isinstance(value, dict):
        return "{" + ",".join(
            json.dumps(key, ensure_ascii=False, separators=(",", ":"))
            + ":"
            + canonical_json(value[key])
            for key in sorted(value.keys())
        ) + "}"
    raise ValueError("unsupported_canonical_value")


class PolicyProcessAttestationV9(gl.contract.Contract):
    attestation_criterion: str
    authorized_runtime_address: str
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
        authorized_runtime_address: str,
    ):
        self.attestation_criterion = attestation_criterion
        self.authorized_runtime_address = authorized_runtime_address.lower()
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
    def get_contract_version(self) -> str:
        return "hollis.policy-process-attestation.v9"

    @gl.public.view
    def get_authorized_runtime_address(self) -> str:
        return self.authorized_runtime_address

    @gl.public.view
    def get_policy_binding(self) -> str:
        return json.dumps(
            {
                "attestationCriterion": self.attestation_criterion,
                "authorizedRuntimeAddress": self.authorized_runtime_address,
                "evidenceRequirement": self.evidence_requirement,
                "interpretation": self.interpretation,
                "policyControlId": self.policy_control_id,
                "policyControlVersion": self.policy_control_version,
                "policyDocumentDigest": self.policy_document_digest,
                "policyId": self.policy_id,
                "policyVersion": self.policy_version,
                "sourceVersion": "v9",
            },
            sort_keys=True,
        )

    @gl.public.view
    def get_evaluation_reason(self, case_commitment: str) -> str:
        return self.evaluation_reasons.get(case_commitment, "not_found")

    @gl.public.view
    def get_status(self, case_commitment: str) -> str:
        return self.statuses.get(case_commitment, "not_found")

    @gl.public.view
    def get_verdict(self, case_commitment: str) -> str:
        return self.verdicts.get(case_commitment, "not_found")

    def _record_once(self, case_commitment: str, status: str, verdict: str, reason: str) -> None:
        if self.statuses.get(case_commitment, "not_found") != "not_found":
            return
        self.evaluation_reasons[case_commitment] = reason
        self.statuses[case_commitment] = status
        self.verdicts[case_commitment] = verdict

    @gl.public.write
    def adjudicate(self, case_commitment: str, public_case_file_url: str) -> None:
        if str(gl.message.sender_address).lower() != self.authorized_runtime_address:
            raise gl.vm.UserError("unauthorized_runtime")
        if self.statuses.get(case_commitment, "not_found") != "not_found":
            raise gl.vm.UserError("case_commitment_already_finalized")
        parsed_url = urlparse(public_case_file_url)
        if (
            parsed_url.scheme != "https"
            or not parsed_url.hostname
            or parsed_url.username
            or parsed_url.password
            or parsed_url.port not in (None, 443)
        ):
            raise gl.vm.UserError("invalid_public_case_file_url")

        def fetch_case_file() -> str:
            response = gl.nondet.web.get(public_case_file_url)
            if getattr(response, "status", 200) != 200:
                raise ValueError("document_unavailable")
            body = response.body
            if len(body) > MAX_DOCUMENT_BYTES:
                raise ValueError("document_too_large")
            document = json.loads(body.decode("utf-8"), object_pairs_hook=reject_duplicate_keys)
            canonical = document["canonicalRecord"]
            commitment = "sha256:" + hashlib.sha256(
                (COMMITMENT_PREFIX + canonical_json(canonical)).encode("utf-8")
            ).hexdigest()
            return json.dumps(
                {
                    "caseCommitment": document["caseCommitment"],
                    "canonicalCommitment": commitment,
                    "canonicalPolicy": canonical["policy"],
                    "canonicalSchemaVersion": canonical["schemaVersion"],
                    "decisionRecorded": canonical["review"]["decisionRecorded"],
                    "evidence": canonical["evidence"],
                    "policy": document["policy"],
                },
                sort_keys=True,
            )

        try:
            facts = json.loads(gl.eq_principle.strict_eq(fetch_case_file))
        except Exception:
            self._record_once(case_commitment, "undetermined", "undetermined", "invalid_case_file")
            return

        if facts["caseCommitment"] != case_commitment or facts["canonicalCommitment"] != case_commitment:
            self._record_once(case_commitment, "undetermined", "undetermined", "case_commitment_mismatch")
            return
        if facts["canonicalSchemaVersion"] != "hollis.canonical-case.v1":
            self._record_once(case_commitment, "undetermined", "undetermined", "schema_version_mismatch")
            return
        policy = facts["policy"]
        canonical_policy = facts["canonicalPolicy"]
        control = policy["control"]
        if (
            policy["policyId"] != self.policy_id
            or policy["policyVersion"] != self.policy_version
            or control["controlId"] != self.policy_control_id
            or control["controlVersion"] != self.policy_control_version
            or control["policyDocumentDigest"] != self.policy_document_digest
            or control["attestationCriterion"] != self.attestation_criterion
            or control["evidenceRequirement"] != self.evidence_requirement
            or control["interpretation"] != self.interpretation
            or canonical_policy["policyId"] != policy["policyId"]
            or canonical_policy["policyVersion"] != policy["policyVersion"]
            or canonical_policy["controlId"] != control["controlId"]
            or canonical_policy["controlVersion"] != control["controlVersion"]
            or canonical_policy["policyDocumentDigest"] != control["policyDocumentDigest"]
        ):
            self._record_once(case_commitment, "undetermined", "undetermined", "policy_binding_mismatch")
            return
        if facts["decisionRecorded"] is not True:
            self._record_once(case_commitment, "finalized", "fail", "human_decision_missing")
            return
        evidence = facts["evidence"]
        if self.evidence_requirement == "reference_required" and len(evidence) < 1:
            self._record_once(case_commitment, "finalized", "fail", "evidence_reference_missing")
            return
        if self.evidence_requirement == "verified_reference_required" and not any(
            item.get("verified") is True for item in evidence
        ):
            self._record_once(case_commitment, "finalized", "fail", "verified_evidence_reference_missing")
            return
        if self.interpretation == "judgment_required":
            self._record_once(case_commitment, "finalized", "needs_review", "judgment_required")
            return
        self._record_once(case_commitment, "finalized", "pass", "requirements_satisfied")
