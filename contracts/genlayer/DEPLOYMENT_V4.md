# Policy-process attestation V4 deployment record

`policy_process_attestation_v4.py` uses `gl.nondet.web.get` for a JSON case file. The current
GenLayer API documents `web.get` as the raw-response interface and `web.render` as the rendered-page
interface. V4 reads the response body as UTF-8 JSON before its strict-equivalence comparison.

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

## Required finalized evidence

Record the V4 deployment, then submit exactly one final pass and one final fail write:

| Expected verdict | Case commitment | Public case-file URL |
| --- | --- | --- |
| `pass` | `sha256:1111111111111111111111111111111111111111111111111111111111` | `https://thehollis.vercel.app/attestation-cases/v1/deterministic-pass.json` |
| `fail` | `sha256:5555555555555555555555555555555555555555555555555555555555` | `https://thehollis.vercel.app/attestation-cases/v1/deterministic-fail.json` |

Wait for `FINALIZED` and verify execution result `FINISHED_WITH_RETURN`, `get_status` equals
`finalized`, and `get_verdict` matches the expected value. Use a fresh Studio-recommended fee for
every transaction. Do not add the fee profile to Git until the receipts and profile have been
independently checked.
