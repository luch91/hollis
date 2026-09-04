# Policy-process attestation V6 deployment procedure

V6 preserves V5's verified deterministic process checks and stores each result under its own case
commitment. A later adjudication cannot overwrite an earlier case's status, verdict, or evaluation
reason.

V6 is not deployed. V5 remains the completed Studio Dev representative-validation contract.

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

## Required validation

Deploy V6 as a new Studio Dev contract. Do not reuse the V5 address. Before recording V6 as a
candidate integration contract, submit the pass and fail synthetic case files in either order.

For each write, use the exact `caseCommitment` from the respective checked-in case file. Do not type
the repeated digest characters manually.

| Expected verdict | Case file |
| --- | --- |
| `pass` | `https://thehollis.vercel.app/attestation-cases/v1/deterministic-pass.json` |
| `fail` | `https://thehollis.vercel.app/attestation-cases/v1/deterministic-fail.json` |

After both transactions finalize, call every V6 view twice: once with the pass commitment and once
with the fail commitment. The pass commitment must retain `finalized`, `pass`, and
`requirements_satisfied`; the fail commitment must retain `finalized`, `fail`, and
`human_decision_missing`.

Record the address, deployment transaction, both write transactions, all six view responses, and
fresh Studio fee estimates. Do not activate the Hollis API adapter until this evidence is complete.
