# Policy-process attestation V7 deployment procedure

V7 preserves V6 per-case results and deterministic adjudication. It adds `get_policy_binding`, a
read-only view of every immutable policy constructor value. This is required because the first
Truvyx-bound V6 deployment repeatedly returned `policy_document_digest_mismatch` even though its
deployment calldata and the public fixtures displayed the same digest.

## V6 diagnostic record

| Item | Value |
| --- | --- |
| Contract | `0x3d11fB8a1116790eaA279dE8e9d4D207AFC8A1fe` |
| Deployment transaction | `0x9fb0bdbbcdfa9a6c4dec5b0502d8a17afd60c54a3849e8cef14fed27b2afadc9` |
| First pass write | `0x8027420dec1827bea4e93f291d575165f473ca361ce754d9916a54614235a820` |
| First fail write | `0xf756b43545b58b324128eeef0943b26c639b6cfe2109e34485d7ca74743d9dd2` |
| Replacement pass write | `0x9b6758d9e0d6c252363acf4513fa63cabd8c3c18941141b3cf322d37b3060e9b` |
| Replacement fail write | `0xcbdda22028dc3034dcd683aef2f14d9fc2393fc16082733248e18e46bf6eb5eb` |
| Cache-isolation pass write | `0x68e84c4a5fa8871431cb97cb91eaa56320cca99d3171ba0abd521287554e3674` |
| Cache-isolation fail write | `0x53a709a179a86818df127171edfc63de40f53c04522cbef63318ba324aa3bc72` |
| Retained outcome | Both commitments return `undetermined` and `policy_document_digest_mismatch`. |

Each listed write finalized successfully, targeted the recorded contract, and reached
`MAJORITY_AGREE`. Finality did not establish a successful Hollis policy result. Do not activate
this address in the API importer.

## V7 constructor values

| Field | Value |
| --- | --- |
| `policy_id` | `truvyx-release-governance` |
| `policy_version` | `release-governance-1.0` |
| `policy_control_id` | `independent-human-approval` |
| `policy_control_version` | `1.0` |
| `policy_document_digest` | `sha256:63912e39d3103a743b6853bf48b3fb9627183cf6708e1a8af603532cafe519d8` |
| `attestation_criterion` | `A qualified human reviewer must record a final decision before the release recommendation is accepted.` |
| `evidence_requirement` | `verified_reference_required` |
| `interpretation` | `deterministic` |

## Required order

1. Load `policy_process_attestation_v7.py` in Studio Dev.
2. Confirm schema extraction succeeds with the pinned `v0.3.0` runner.
3. Enter the exact constructor values above and deploy once.
4. Wait for finalization and verify successful execution, not finality alone.
5. Call `get_policy_binding` before any adjudication.
6. Compare every returned field byte-for-byte with the table above.
7. Stop if any value differs. Do not submit a write to that deployment.
8. If the binding matches, adjudicate the checked-in Truvyx pass and fail fixtures.
9. Activate the API importer only after all six per-case views return the expected results.

## Expected representative results

| Fixture | Status | Verdict | Evaluation reason |
| --- | --- | --- | --- |
| `truvyx-deterministic-pass.json` | `finalized` | `pass` | `requirements_satisfied` |
| `truvyx-deterministic-fail.json` | `finalized` | `fail` | `human_decision_missing` |

The local linter completed its three source checks. Studio Dev schema extraction currently reports
the approved runner as absent for both unchanged V6 and V7. The matching Windows direct-mode test
environment downloads the runner successfully but fails before contract loading because its
temporary-file cleanup is not Windows compatible. Neither condition is evidence of a contract
logic failure, and neither may be reported as a passing runtime test.
