# Policy-process attestation V2 deployment record

`policy_process_attestation_v2.py` replaces the undeployed V1 contract. V2 binds one policy
control at deployment and accepts a case commitment and public case-file URL for each attestation.
It can therefore exercise multiple case outcomes against one immutable policy binding.

V2 uses the current Studio v0.3 contract format. Do not substitute the older SDK header or
`gl.Contract` syntax from the retained V1 draft. The source header must retain the current
`py-genlayer` pin: `5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng`.

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
| Contract address | `0x4cfc03E884466D123346fD6fb76A041eAaabDEed` |
| Deployment transaction | `0x0d40017edd0cc1923814647d4f9fbd8703b18d0b6c30666158932e3ccbfbb456` |
| Finalization time | `2026-09-04T08:38:05Z` |

The deployment finalized with a successful `MAJORITY_AGREE` consensus result. All five selected
validators completed the round. The deployment used the constructor values listed above and the
source pin declared in V2.

V2 is not an active Hollis attestation contract. Its pass-case write transaction
`0xe3b8a79a612120653df2429ccbec08b81cb4fbed34bbc50833c76203003aa2a6` finalized with
`FINISHED_WITH_ERROR`: Studio Dev returned a string from `gl.nondet.web.render(..., mode="text")`,
while V2 incorrectly accessed `.text`. Preserve V2 as deployed evidence. Use V3 for all future
deployment and adjudication activity.

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

The executable procedure is in `PROFILE_V3.md`. Do not add a profile to Git until a finalized
Studio Dev run produces measured values and the recorded transactions have been checked.
