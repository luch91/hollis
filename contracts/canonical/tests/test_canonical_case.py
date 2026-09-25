import json
from pathlib import Path

import pytest

from contracts.canonical.verify_canonical_case import (
    canonical_json,
    compute_case_commitment,
    verify_document,
)


VECTOR_PATH = (
    Path(__file__).resolve().parents[1] / "test-vectors" / "canonical-case-v1.json"
)


def vector():
    return json.loads(VECTOR_PATH.read_text(encoding="utf-8"))


def test_matches_language_neutral_vector():
    fixture = vector()
    assert canonical_json(fixture["record"]) == fixture["canonicalJson"]
    assert compute_case_commitment(fixture["record"]) == fixture["caseCommitment"]
    document = {
        "caseCommitment": fixture["caseCommitment"],
        "commitmentVersion": "hollis.case-commitment.v1",
        "record": fixture["record"],
    }
    assert verify_document(document) == fixture["caseCommitment"]


def test_evidence_order_changes_commitment():
    fixture = vector()
    record = fixture["record"]
    record["evidence"].reverse()
    assert compute_case_commitment(record) != fixture["caseCommitment"]


def test_non_ascii_keys_use_unicode_scalar_order():
    assert canonical_json({"😀": 3, "é": 2, "z": 1}) == '{"z":1,"é":2,"😀":3}'


def test_schema_version_is_bound_and_unsupported_versions_are_rejected():
    fixture = vector()
    fixture["record"]["schemaVersion"] = "v2"
    assert canonical_json(fixture["record"]) != fixture["canonicalJson"]
    with pytest.raises(ValueError, match="Unsupported canonical case schema version"):
        compute_case_commitment(fixture["record"])


@pytest.mark.parametrize(
    "path,value",
    [
        (("auditManifestHash",), "sha256:" + "1" * 64),
        (("caseIdentityCommitment",), "sha256:" + "2" * 64),
        (("evidence", 0, "digest"), "sha256:" + "3" * 64),
        (("evidence", 0, "mediaType"), "text/plain"),
        (("policy", "controlVersion"), "2.0"),
        (("policy", "controlId"), "second-review"),
        (("policy", "policyId"), "appeals"),
        (("policy", "policyVersion"), "2026.2"),
        (("policy", "policyDocumentDigest"), "sha256:" + "4" * 64),
        (("privateReviewFactsCommitment",), "sha256:" + "5" * 64),
        (("review", "decisionRecorded"), False),
        (("review", "escalationRecorded"), True),
        (("review", "humanDecisionOutcome"), "rejected"),
        (("review", "reviewerActionCommitment"), "sha256:" + "6" * 64),
        (("evidence", 0, "verified"), False),
    ],
)
def test_bound_field_changes_commitment(path, value):
    fixture = vector()
    record = fixture["record"]
    target = record
    for part in path[:-1]:
        target = target[part]
    target[path[-1]] = value
    assert compute_case_commitment(record) != fixture["caseCommitment"]


def test_rejects_mismatched_commitment():
    fixture = vector()
    with pytest.raises(ValueError, match="does not match"):
        verify_document(
            {
                "caseCommitment": "sha256:" + "0" * 64,
                "commitmentVersion": "hollis.case-commitment.v1",
                "record": fixture["record"],
            }
        )
