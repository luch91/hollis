# Policy-process attestation V6 deployment procedure

V6 preserves V5's verified deterministic process checks and stores each result under its own case
commitment. A later adjudication cannot overwrite an earlier case's status, verdict, or evaluation
reason.

V6 has completed a valid Studio Dev deployment, but it has not yet completed representative
validation. V5 remains the completed Studio Dev representative-validation contract.

## Rejected deployment record

| Item | Value |
| --- | --- |
| Transaction | `0x65165f57b7d4fc97e8d3b3e6e5ca8e81556a8b7eb91766599d8f8f430e6bd882` |
| Result | `FINALIZED`, `MAJORITY_AGREE`, leader execution `ERROR` |
| Verified cause | The initial V6 constructor used `TreeMap()`, which the current Studio runtime rejects for generic persistent storage. |

The source now uses the documented `gl.storage.inmem_allocate(TreeMap[str, str])` form for each
persistent map. Studio Dev schema extraction passed after this correction. Do not use the address
associated with the rejected deployment.

## Verified deployment

| Item | Value |
| --- | --- |
| Contract address | `0x1fcA673F741CDE49A442E156Cfc2abE74dd25EA2` |
| Deployment transaction | `0xba6bd0f9e92039d95057fc267dc108947a4b1db415863a9bb3dee6f8eb9098a0` |
| Result | `FINALIZED`, `MAJORITY_AGREE`, leader execution `SUCCESS` |

The source retrieved from the deployed address was checked for the V6 class, the documented
persistent-map allocation, and all three case-commitment view methods.

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

## Studio execution procedure

Run the following from the repository root before each Studio write. Each command copies the exact
commitment to the clipboard and intentionally produces no terminal output.

For the pass case:

```powershell
$caseFile = Get-Content -Raw .\apps\web\public\attestation-cases\v1\deterministic-pass.json
$caseFile -match '"caseCommitment":\s*"([^"]+)"' | Out-Null
Set-Clipboard -Value $matches[1]
```

For the fail case:

```powershell
$caseFile = Get-Content -Raw .\apps\web\public\attestation-cases\v1\deterministic-fail.json
$caseFile -match '"caseCommitment":\s*"([^"]+)"' | Out-Null
Set-Clipboard -Value $matches[1]
```

In GenLayer Studio, open contract `0x1fcA673F741CDE49A442E156Cfc2abE74dd25EA2` and select
`adjudicate`. Paste the clipboard value into `case_commitment`. Enter only the corresponding URL
from the table above into `public_case_file_url`. Do not include either field name in the input.
Submit the pass write first and wait for its final status. Then submit the fail write.

After the fail write finalizes, call each view with the pass commitment and again with the fail
commitment:

- `get_status`
- `get_verdict`
- `get_evaluation_reason`

The expected results are:

| Commitment | Status | Verdict | Evaluation reason |
| --- | --- | --- | --- |
| Pass fixture | `finalized` | `pass` | `requirements_satisfied` |
| Fail fixture | `finalized` | `fail` | `human_decision_missing` |

Record the address, deployment transaction, both write transactions, all six view responses, and
fresh Studio fee estimates. Do not activate the Hollis API adapter until this evidence is complete.
