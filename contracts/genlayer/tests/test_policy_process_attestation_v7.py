import json


POLICY_ID = "truvyx-release-governance"
POLICY_VERSION = "release-governance-1.0"
CONTROL_ID = "independent-human-approval"
CONTROL_VERSION = "1.0"
POLICY_DOCUMENT_DIGEST = "sha256:63912e39d3103a743b6853bf48b3fb9627183cf6708e1a8af603532cafe519d8"
ATTESTATION_CRITERION = (
    "A qualified human reviewer must record a final decision before the release recommendation "
    "is accepted."
)


def case_file(case_commitment: str, decision_recorded: bool):
    return {
        "auditManifestHash": "sha256:" + "b" * 64,
        "caseCommitment": case_commitment,
        "evidence": [
            {
                "digest": "sha256:" + "c" * 64,
                "mediaType": "application/json",
                "verified": True,
            }
        ],
        "policy": {
            "control": {
                "attestationCriterion": ATTESTATION_CRITERION,
                "controlId": CONTROL_ID,
                "controlVersion": CONTROL_VERSION,
                "evidenceRequirement": "verified_reference_required",
                "interpretation": "deterministic",
                "policyDocumentDigest": POLICY_DOCUMENT_DIGEST,
            },
            "policyId": POLICY_ID,
            "policyVersion": POLICY_VERSION,
        },
        "review": {
            "decisionRecorded": decision_recorded,
            "escalationRecorded": False,
            "humanDecisionOutcome": "approved" if decision_recorded else None,
            "reviewerActionCommitment": "sha256:" + "d" * 64,
        },
        "schemaVersion": "hollis.adjudication-case.v1",
    }


def deploy(direct_deploy):
    return direct_deploy(
        "contracts/genlayer/policy_process_attestation_v7.py",
        POLICY_ID,
        POLICY_VERSION,
        CONTROL_ID,
        CONTROL_VERSION,
        POLICY_DOCUMENT_DIGEST,
        ATTESTATION_CRITERION,
        "verified_reference_required",
        "deterministic",
    )


def test_policy_binding_is_observable(direct_deploy):
    contract = deploy(direct_deploy)

    assert json.loads(contract.get_policy_binding()) == {
        "attestationCriterion": ATTESTATION_CRITERION,
        "evidenceRequirement": "verified_reference_required",
        "interpretation": "deterministic",
        "policyControlId": CONTROL_ID,
        "policyControlVersion": CONTROL_VERSION,
        "policyDocumentDigest": POLICY_DOCUMENT_DIGEST,
        "policyId": POLICY_ID,
        "policyVersion": POLICY_VERSION,
    }


def test_representative_results_remain_addressable(direct_vm, direct_deploy):
    pass_commitment = "sha256:" + "1" * 64
    fail_commitment = "sha256:" + "5" * 64
    pass_url = "https://public.hollis.test/truvyx-pass.json"
    fail_url = "https://public.hollis.test/truvyx-fail.json"
    direct_vm.strict_mocks = True
    direct_vm.mock_web(
        pass_url,
        {"status": 200, "body": json.dumps(case_file(pass_commitment, True))},
    )
    direct_vm.mock_web(
        fail_url,
        {"status": 200, "body": json.dumps(case_file(fail_commitment, False))},
    )
    contract = deploy(direct_deploy)

    contract.adjudicate(pass_commitment, pass_url)
    contract.adjudicate(fail_commitment, fail_url)

    assert contract.get_status(pass_commitment) == "finalized"
    assert contract.get_verdict(pass_commitment) == "pass"
    assert contract.get_evaluation_reason(pass_commitment) == "requirements_satisfied"
    assert contract.get_status(fail_commitment) == "finalized"
    assert contract.get_verdict(fail_commitment) == "fail"
    assert contract.get_evaluation_reason(fail_commitment) == "human_decision_missing"
