# Policy-process attestation V5 deployment record

`policy_process_attestation_v5.py` retains the V4 JSON retrieval path and adds a bounded,
persisted evaluation-reason code. This distinguishes a valid `pass`, `fail`, or `needs_review`
outcome from an `undetermined` configuration mismatch without exposing case contents on chain.

## Constructor values

| Field | Value |
| --- | --- |
| `policy_id` | `claims` |
| `policy_version` | `2026-09` |
| `policy_control_id` | `claims-human-review` |
| `policy_control_version` | `2026-09` |
| `policy_document_digest` | `sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` |
| `attestation_criterion` | `A human decision and a verified evidence reference are required.` |
| `evidence_requirement` | `verified_reference_required` |
| `interpretation` | `deterministic` |

## Required representative executions

V5 was deployed as a new Studio Dev contract. Do not reuse V4's address.

| Item | Value |
| --- | --- |
| Contract address | `0xCC042cf9F21021efe43C2fA111bd7Bab6816f29d` |
| Deployment transaction | `0x48b8c351c00ec3acd089c7cb2f200fc748da7d239db3a832b202b0e35248453d` |
| Deployment result | `FINALIZED`, `MAJORITY_AGREE` |

The source retrieved from the deployed address was checked against the V5 class name, JSON
retrieval path, dependency pin, constructor assignments, and `get_evaluation_reason` view.

Submit the pass case only and query all three views: `get_status`, `get_verdict`, and
`get_evaluation_reason`.

| Expected verdict | Case commitment | Public case-file URL |
| --- | --- | --- |
| `pass` | `sha256:1111111111111111111111111111111111111111111111111111111111` | `https://thehollis.vercel.app/attestation-cases/v1/deterministic-pass.json` |

Proceed to the fail case only if the pass transaction is `FINALIZED` with
`FINISHED_WITH_RETURN`, `get_status` is `finalized`, `get_verdict` is `pass`, and
`get_evaluation_reason` is `requirements_satisfied`.

| Expected verdict | Case commitment | Public case-file URL |
| --- | --- | --- |
| `fail` | `sha256:5555555555555555555555555555555555555555555555555555555555` | `https://thehollis.vercel.app/attestation-cases/v1/deterministic-fail.json` |

For each transaction, use a fresh Studio-recommended fee and record the contract address,
transaction hash, finalization result, returned status, verdict, and evaluation reason. Do not add a
fee profile to Git until these values have been independently checked.
