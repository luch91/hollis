#!/usr/bin/env python3
"""Independent verifier for Hollis canonical case commitment version 1."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


CASE_COMMITMENT_DOMAIN = "hollis.case-commitment.v1"
CASE_SCHEMA_VERSION = "hollis.canonical-case.v1"
CANONICALIZATION_VERSION = "hollis.canonical-json.v1"


def canonical_json(value: Any) -> str:
    if value is None or isinstance(value, (bool, str)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, int) and not isinstance(value, bool):
        if abs(value) > 9_007_199_254_740_991:
            raise ValueError("Canonical JSON permits only safe integer numbers.")
        return str(value)
    if isinstance(value, float):
        raise ValueError("Canonical JSON permits only safe integer numbers.")
    if isinstance(value, list):
        return "[" + ",".join(canonical_json(item) for item in value) + "]"
    if isinstance(value, dict):
        if not all(isinstance(key, str) for key in value):
            raise ValueError("Canonical JSON object keys must be strings.")
        return "{" + ",".join(
            json.dumps(key, ensure_ascii=False) + ":" + canonical_json(value[key])
            for key in sorted(value)
        ) + "}"
    raise ValueError(f"Canonical JSON does not support {type(value).__name__}.")


def compute_case_commitment(record: dict[str, Any]) -> str:
    if record.get("schemaVersion") != CASE_SCHEMA_VERSION:
        raise ValueError("Unsupported canonical case schema version.")
    if record.get("canonicalization") != CANONICALIZATION_VERSION:
        raise ValueError("Unsupported canonicalization version.")
    payload = f"{CASE_COMMITMENT_DOMAIN}\n{canonical_json(record)}".encode()
    return "sha256:" + hashlib.sha256(payload).hexdigest()


def verify_document(document: dict[str, Any]) -> str:
    canonical = document.get("canonical")
    if isinstance(canonical, dict):
        document = canonical
    record = document.get("record", document.get("canonicalRecord"))
    commitment = document.get("caseCommitment")
    version = document.get("commitmentVersion")
    if not isinstance(record, dict) or not isinstance(commitment, str):
        raise ValueError("The document must contain a record and caseCommitment.")
    if version != CASE_COMMITMENT_DOMAIN:
        raise ValueError("Unsupported case commitment version.")
    calculated = compute_case_commitment(record)
    if calculated != commitment:
        raise ValueError("The case commitment does not match the canonical record.")
    return calculated


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("document", type=Path)
    arguments = parser.parse_args()
    document = json.loads(arguments.document.read_text(encoding="utf-8"))
    print(verify_document(document))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
