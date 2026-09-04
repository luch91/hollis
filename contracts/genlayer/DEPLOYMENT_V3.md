# Policy-process attestation V3 deployment record

`policy_process_attestation_v3.py` preserved the V2 process logic but was not suitable for JSON
case files. Its pass-case transaction `0xba3ce9669c34cc56c8fdac2dd0cdf464e39a9abb378c08ad2d83c16fffa5f48e`
finalized with `FINISHED_WITH_ERROR` because `gl.nondet.web.render(..., mode="text")` returned an
empty rendered string for the JSON endpoint. Preserve V3 as deployment evidence. Use V4 for future
deployment and adjudication activity.

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

V3 deployment details are retained below as historical evidence. Do not submit further writes to
this contract.

| Artifact | Value |
| --- | --- |
| Network | `studio-dev` / `61997` |
| Contract source | `policy_process_attestation_v3.py` |
| Contract address | `0x4b5AEfEC4565e994C0CdCC1eecA7Af0AD7BA5608` |
| Deployment transaction | `0x3fbd0f01d5cef8541f60e0f6c46ef46a442fe663d926dc878a4df8d24d262b34` |
| Finalization time | `2026-09-04T08:58:03Z` |

The deployment finalized with `MAJORITY_AGREE` and `FINISHED_WITH_RETURN` using the V3 source and
declared `5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng` dependency pin.

## Historical fixture references

| Expected verdict | Case commitment | Public case-file URL |
| --- | --- | --- |
| `pass` | The exact `caseCommitment` in the pass case file | `https://web-1105e3dz1-oluchi-judiths-projects.vercel.app/attestation-cases/v1/deterministic-pass.json` |
| `fail` | The exact `caseCommitment` in the fail case file | `https://web-1105e3dz1-oluchi-judiths-projects.vercel.app/attestation-cases/v1/deterministic-fail.json` |
