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

## Recorded Studio Dev execution

| Item | Value |
| --- | --- |
| Contract address | `0x99fCa215e89C895401ae790CB11d9eeaF0Af07F8` |
| Deployment transaction | `0x2d539a5fb1ce779916843818a2d00aa7bc6fe8df8959abac6048b5836439d5d0` |
| Pass-write transaction | `0x97cc3bb0c8a431a27c22ccec2ff631e6fa621edb1d1145db203a96282c418705` |
| Deployment result | `FINALIZED`, `MAJORITY_AGREE`, `FINISHED_WITH_RETURN` |
| Pass-write result | `FINALIZED`, `MAJORITY_AGREE`, `FINISHED_WITH_RETURN` |
| Stored status after pass write | `undetermined` |
| Stored verdict after pass write | `undetermined` |

The V4 write completed without a runtime error, but it did not record the expected verdict. Direct
comparison later established that the V4 calldata used `sha256:` followed by 58 `1` characters,
while the public pass fixture uses 64. This satisfies V4's `undetermined` branch for a case
commitment mismatch. Do not submit further writes to V4. V5 persists this reason explicitly.

## Historical representative inputs

Record the V4 deployment, then submit exactly one final pass and one final fail write:

| Expected verdict | Case commitment | Public case-file URL |
| --- | --- | --- |
| `pass` | The exact `caseCommitment` value in the pass case file | `https://thehollis.vercel.app/attestation-cases/v1/deterministic-pass.json` |
| `fail` | The exact `caseCommitment` value in the fail case file | `https://thehollis.vercel.app/attestation-cases/v1/deterministic-fail.json` |

These inputs are retained as historical V4 test vectors. Use a fresh Studio-recommended fee for
every transaction. Do not add a fee profile to Git until its receipts and profile have been
independently checked.
