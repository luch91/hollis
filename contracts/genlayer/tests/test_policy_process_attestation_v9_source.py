from pathlib import Path


SOURCE = Path("contracts/genlayer/policy_process_attestation_v9.py").read_text(encoding="utf-8")


def test_v9_binds_writes_to_the_configured_runtime_and_rejects_replay():
    assert "authorized_runtime_address" in SOURCE
    assert "gl.message.sender_address" in SOURCE
    assert "unauthorized_runtime" in SOURCE
    assert "case_commitment_already_finalized" in SOURCE
    assert "def _record_once" in SOURCE


def test_v9_recomputes_the_canonical_commitment_and_rejects_unsafe_documents():
    assert "hollis.case-commitment.v1" in SOURCE
    assert "hashlib.sha256" in SOURCE
    assert "object_pairs_hook=reject_duplicate_keys" in SOURCE
    assert "MAX_DOCUMENT_BYTES" in SOURCE
    assert "parsed_url.scheme != \"https\"" in SOURCE
    assert "case_commitment_mismatch" in SOURCE


def test_v9_reads_the_flattened_canonical_policy_shape():
    assert 'return "hollis.policy-process-attestation.v9"' in SOURCE
    assert '"canonicalPolicy": canonical["policy"]' in SOURCE
    assert '"policy": document["policy"]' in SOURCE
    assert 'canonical_policy["controlId"] != control["controlId"]' in SOURCE
