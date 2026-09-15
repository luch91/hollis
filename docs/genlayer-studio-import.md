# Legacy Studio Next attestation import

This document applies only to historical records created before Hollis's managed GenLayer runtime.
The current customer workflow automatically submits a completed review to the active policy-control
contract through Hollis's server-side Studio Next execution account. It does not ask a customer to
use a wallet, operate Studio, or import a transaction hash.

The legacy importer can record a finalized V6 attestation after an authorized operator submitted
the write from GenLayer Studio. The API performs only read operations for that historical path.

The importer is not active until the V6 contract has verified synthetic pass and fail writes whose
per-case results remain independently queryable after the second write. Follow
[`contracts/genlayer/DEPLOYMENT_V6.md`](../contracts/genlayer/DEPLOYMENT_V6.md) before enabling the
runtime setting below.

## Configuration

Set the deployed V6 contract address in the API runtime environment:

```text
GENLAYER_STUDIO_CONTRACT_ADDRESS=0x1fcA673F741CDE49A442E156Cfc2abE74dd25EA2
```

This address is the historical V6 deployment recorded in
[`contracts/genlayer/DEPLOYMENT_V6.md`](../contracts/genlayer/DEPLOYMENT_V6.md). When set, API startup checks
the contract's finalized per-case views for the documented pass and fail results. Startup fails
until both results have been recorded and retained.

## Import contract

`POST /v1/review-cases/:caseId/attestations/import` requires `reviews:attest` and accepts the
approved policy binding, public case-file URL, and finalized transaction hash. The request uses the
same policy fields as standard attestation creation plus:

```json
{
  "transactionHash": "0x..."
}
```

Before writing an attestation record, Hollis verifies that the legacy transaction is finalized
and accepted, targets the configured contract, and calls `adjudicate` with the case commitment and
public case-file URL that Hollis generated. It then reads `get_status`, `get_verdict`, and
`get_evaluation_reason` using that commitment. The receipt is recorded only when the stored V6
result is finalized.

An imported result is supplementary audit evidence. PostgreSQL remains the source of truth for the
review workflow and human decision.
