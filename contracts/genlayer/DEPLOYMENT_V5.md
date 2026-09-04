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

## Rejected write record

| Item | Value |
| --- | --- |
| Transaction | `0xed399a5e549cc6dba102bad2d0bb0a0221bf5e029b874ec075bad73fa5433722` |
| Finalization | `FINALIZED`, `MAJORITY_AGREE`, leader execution `ERROR` |
| Verified cause | The second calldata argument included the literal field label `public_case_file_url ` before the URL. GenLayer rejected the resulting value as `MALFORMED_URL`. |

This write did not invoke the contract's decision logic and did not change its initial state. Do not
alter the contract for this rejected input. Submit the public URL alone, without a field label,
whitespace prefix, or quotation marks.

## Undetermined write record

| Item | Value |
| --- | --- |
| Transaction | `0x6df05ce557485d97b39ef3a57609705cd5fc2fb9d4aea72e5a5eae37fee9981e` |
| Finalization | `FINALIZED`, `MAJORITY_AGREE`, leader execution `SUCCESS` |
| Stored evaluation reason | `case_commitment_mismatch` |
| Verified cause | The transaction supplied `sha256:` followed by 58 `1` characters. The public pass fixture contains `sha256:` followed by 64 `1` characters. |

The contract correctly rejected the mismatched commitment and preserved an `undetermined` state.
Do not change the contract. Use the exact commitment value in the public pass fixture for the next
and final pass attempt.

To copy the exact pass commitment from the checked-in fixture on Windows PowerShell:

```powershell
$caseFile = gc -Raw .\apps\web\public\attestation-cases\v1\deterministic-pass.json
$pattern = '"caseCommitment":\s*"([^"]+)"'
$caseFile -match $pattern | Out-Null
Set-Clipboard -Value $matches[1]
```

If a separate verification command reports `71`, that number is only the character count. Do not
enter or copy `71` into Studio. Paste the clipboard value directly into Studio's
`case_commitment` input unchanged. Do not type or count the repeated characters manually.

## Rejected literal-count write record

| Item | Value |
| --- | --- |
| Transaction | `0xe8614f30dd369049a127525a8b5869c308fafa492e4a11fdf891992e8e8c7620` |
| Finalization | `FINALIZED`, `MAJORITY_AGREE`, leader execution `SUCCESS` |
| Verified cause | The first calldata argument was the literal string `71`, rather than the case commitment. |

This write correctly persisted `case_commitment_mismatch`. It does not indicate a contract or
fixture defect.

Submit the pass case only and query all three views: `get_status`, `get_verdict`, and
`get_evaluation_reason`.

| Expected verdict | Case commitment | Public case-file URL |
| --- | --- | --- |
| `pass` | The exact `caseCommitment` value in the pass case file | `https://thehollis.vercel.app/attestation-cases/v1/deterministic-pass.json` |

Proceed to the fail case only if the pass transaction is `FINALIZED` with
`FINISHED_WITH_RETURN`, `get_status` is `finalized`, `get_verdict` is `pass`, and
`get_evaluation_reason` is `requirements_satisfied`.

| Expected verdict | Case commitment | Public case-file URL |
| --- | --- | --- |
| `fail` | The exact `caseCommitment` value in the fail case file | `https://thehollis.vercel.app/attestation-cases/v1/deterministic-fail.json` |

For each transaction, use a fresh Studio-recommended fee and record the contract address,
transaction hash, finalization result, returned status, verdict, and evaluation reason. Do not add a
fee profile to Git until these values have been independently checked.
