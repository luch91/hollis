import os

import pytest
from gltest import get_contract_factory, get_gl_client


pytestmark = pytest.mark.integration

POLICY_ID = "claims"
POLICY_VERSION = "2026-09"
CONTROL_ID = "claims-human-review"
CONTROL_VERSION = "2026-09"
POLICY_DOCUMENT_DIGEST = "sha256:" + "a" * 64
ATTESTATION_CRITERION = "A human decision and a verified evidence reference are required."
DEPLOYMENT_ORIGIN = "https://thehollis.vercel.app"


def require_explicit_operator_approval() -> None:
    if os.environ.get("HOLLIS_ENABLE_STUDIO_DEVNET_INTEGRATION") != "1":
        pytest.skip("Studio Dev integration is opt-in and requires a configured test account.")


def current_fee_preset() -> dict:
    client = get_gl_client()
    estimate = client.estimate_transaction_fees(
        {
            "leaderTimeunitsAllocation": 100,
            "validatorTimeunitsAllocation": 200,
            "totalMessageFees": 0,
            "rotations": [1],
        }
    )
    return {
        "distribution": estimate["distribution"],
        "feeValue": estimate["feeValue"],
    }


@pytest.fixture(scope="module")
def deployed_contract():
    require_explicit_operator_approval()
    factory = get_contract_factory(
        contract_file_path="contracts/genlayer/policy_process_attestation_v5.py"
    )
    return factory.deploy(
        args=[
            POLICY_ID,
            POLICY_VERSION,
            CONTROL_ID,
            CONTROL_VERSION,
            POLICY_DOCUMENT_DIGEST,
            ATTESTATION_CRITERION,
            "verified_reference_required",
            "deterministic",
        ],
        fees=current_fee_preset(),
        wait_until="finalized",
    )


@pytest.mark.parametrize(
    ("case_commitment", "case_file", "expected_verdict", "expected_reason"),
    [
        (
            "sha256:" + "1" * 64,
            "/attestation-cases/v1/deterministic-pass.json",
            "pass",
            "requirements_satisfied",
        ),
        (
            "sha256:" + "5" * 64,
            "/attestation-cases/v1/deterministic-fail.json",
            "fail",
            "human_decision_missing",
        ),
    ],
)
def test_finalized_adjudication_branches(
    deployed_contract,
    case_commitment: str,
    case_file: str,
    expected_verdict: str,
    expected_reason: str,
):
    receipt = deployed_contract.adjudicate(
        args=[case_commitment, f"{DEPLOYMENT_ORIGIN}{case_file}"]
    ).transact(fees=current_fee_preset(), wait_until="finalized")

    assert receipt
    assert deployed_contract.get_last_case_commitment().call() == case_commitment
    assert deployed_contract.get_status().call() == "finalized"
    assert deployed_contract.get_verdict().call() == expected_verdict
    assert deployed_contract.get_evaluation_reason().call() == expected_reason
