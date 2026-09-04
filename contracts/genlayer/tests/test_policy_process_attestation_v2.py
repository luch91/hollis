import json


POLICY_ID = "claims"
POLICY_VERSION = "2026-09"
CONTROL_ID = "claims-human-review"
CONTROL_VERSION = "2026-09"
POLICY_DOCUMENT_DIGEST = "sha256:" + "a" * 64
ATTESTATION_CRITERION = "A human decision and a verified evidence reference are required."


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
            "humanDecisionOutcome": "modified" if decision_recorded else None,
            "reviewerActionCommitment": "sha256:" + "d" * 64,
        },
        "schemaVersion": "hollis.adjudication-case.v1",
    }


def deploy(direct_deploy):
    return direct_deploy(
        "contracts/genlayer/policy_process_attestation_v2.py",
        POLICY_ID,
        POLICY_VERSION,
        CONTROL_ID,
        CONTROL_VERSION,
        POLICY_DOCUMENT_DIGEST,
        ATTESTATION_CRITERION,
        "verified_reference_required",
        "deterministic",
    )


def test_adjudicate_finalizes_a_satisfied_process(direct_vm, direct_deploy):
    case_commitment = "sha256:" + "1" * 64
    case_url = "https://public.hollis.test/deterministic-pass.json"
    direct_vm.strict_mocks = True
    direct_vm.mock_web(
        case_url,
        {"status": 200, "body": json.dumps(case_file(case_commitment, True))},
    )
    contract = deploy(direct_deploy)

    contract.adjudicate(case_commitment, case_url)

    assert contract.get_last_case_commitment() == case_commitment
    assert contract.get_status() == "finalized"
    assert contract.get_verdict() == "pass"


def test_adjudicate_finalizes_a_missing_human_decision_as_fail(direct_vm, direct_deploy):
    case_commitment = "sha256:" + "5" * 64
    case_url = "https://public.hollis.test/deterministic-fail.json"
    direct_vm.strict_mocks = True
    direct_vm.mock_web(
        case_url,
        {"status": 200, "body": json.dumps(case_file(case_commitment, False))},
    )
    contract = deploy(direct_deploy)

    contract.adjudicate(case_commitment, case_url)

    assert contract.get_last_case_commitment() == case_commitment
    assert contract.get_status() == "finalized"
    assert contract.get_verdict() == "fail"
