# Policy-process attestation V2 deployment record

`policy_process_attestation_v2.py` replaces the undeployed V1 contract. V2 binds one policy
control at deployment and accepts a case commitment and public case-file URL for each attestation.
It can therefore exercise multiple case outcomes against one immutable policy binding.

Do not deploy until both public case files below are served over HTTPS without authentication and
have been privacy reviewed. They contain synthetic hashes and no evidence, personal data, prompts,
or policy documents.

## Studio Dev deployment

Use `https://studio-next.genlayer.com`, which is the Studio Dev preview on chain ID `61997`.
Deploy `policy_process_attestation_v2.py` with these constructor values:

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

Record the finalized deployment before making a write:

| Artifact | Value |
| --- | --- |
| Network | `studio-dev` / `61997` |
| Contract source | `policy_process_attestation_v2.py` |
| Contract address | pending |
| Deployment transaction | pending |
| Finalization time | pending |

## Representative writes

After public hosting is available, use the exact deployment origin in these URLs:

| Expected verdict | Case commitment | Case-file path |
| --- | --- | --- |
| `pass` | `sha256:1111111111111111111111111111111111111111111111111111111111111111` | `/attestation-cases/v1/deterministic-pass.json` |
| `fail` | `sha256:5555555555555555555555555555555555555555555555555555555555555555` | `/attestation-cases/v1/deterministic-fail.json` |

Call `adjudicate(case_commitment, public_case_file_url)` once for each row. Wait for finalization,
then verify `get_last_case_commitment`, `get_status`, and `get_verdict`. Record the transaction hash,
finalization time, execution result, and fee outcome for each row. Do not resubmit a transaction that
already has a transaction hash.

## Fee profile

Use the matching v0.6 release-candidate `gltest` tooling to run the representative branch tests and
generate `fee-profile.json`. Keep the resulting profile with the deployment record only after it has
been generated from the finalized Studio Dev executions. The profile is Studio Dev evidence only; it
is not a Clarke or Mainnet price commitment.
