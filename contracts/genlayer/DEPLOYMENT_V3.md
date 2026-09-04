# Policy-process attestation V3 deployment record

`policy_process_attestation_v3.py` corrects the V2 runtime defect discovered in the finalized
Studio Dev pass-case execution. In the Studio v0.3 runtime, `gl.nondet.web.render(..., mode="text")`
returns a string. V3 passes that string directly to `json.loads`.

V3 uses the required source header pin:

```python
# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }
```

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

## Required evidence

Record the finalized V3 deployment address and transaction, then run exactly one final pass and one
final fail write against these immutable public fixtures:

| Expected verdict | Case commitment | Public case-file URL |
| --- | --- | --- |
| `pass` | `sha256:1111111111111111111111111111111111111111111111111111111111` | `https://web-1105e3dz1-oluchi-judiths-projects.vercel.app/attestation-cases/v1/deterministic-pass.json` |
| `fail` | `sha256:5555555555555555555555555555555555555555555555555555555555` | `https://web-1105e3dz1-oluchi-judiths-projects.vercel.app/attestation-cases/v1/deterministic-fail.json` |

Wait for finalization and verify that every write has execution result `FINISHED`, status `FINALIZED`,
and the expected `get_verdict` response. Use a fresh Studio fee recommendation for every write. Do
not add a fee profile to Git until the receipts and profile have been independently checked.
