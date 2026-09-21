# Evidence retention and deletion

Status: operational procedure for the supported evidence adapters. It does not
authorize a retention period; the approved policy and jurisdiction configuration
must be recorded before accepting customer evidence.

## Lifecycle

1. Accepted evidence receives a durable `retentionUntil` value.
2. The scheduler discovers completed, verified, unheld evidence whose date has
   passed, then creates an idempotent deletion job.
3. A worker acquires a lease, rechecks the hold and deletion state in the
   database, deletes the provider object, and records the provider outcome.
4. A successful result clears availability and verification, records
   `evidence_deleted`, and makes download and attestation ineligible.
5. A failed provider call is retried with bounded exponential backoff. After
   eight failed attempts it is visible as `dead_letter` and requires operator
   investigation; do not silently requeue it.

An active legal, incident, or preservation hold wins every eligibility check.
If a hold races a leased worker, the final database update fails closed; treat
the provider call as uncertain and investigate the object version before retry.

## Provider-specific recovery

| Adapter | Deletion call | Recovery and version-expiry procedure |
| --- | --- | --- |
| Cloudflare R2 | S3-compatible `DeleteObject` | R2 deletion is terminal unless bucket-level versioning or an approved backup has been configured. Confirm the exact object key and any retained version before marking an incident resolved. |
| Amazon S3 | `DeleteObject` | With versioning, inspect the delete marker and prior version under the incident/preservation process; without versioning, restore only from an approved backup. Do not remove a delete marker to bypass a hold. |
| Azure Blob Storage | Blob delete with not-found treated idempotently | Check soft-delete/versioning retention settings and restore only an approved version under the incident process. Expired versions are not recoverable through Hollis. |
| Google Cloud Storage | Object delete through the configured adapter | Inspect object-versioning and soft-delete retention in the bucket before restoration. If the provider retention window expired, restore only from an approved backup. |

## Operator response

For a dead-letter job, a mismatched provider result, or suspected deletion under
hold: stop retention for the affected tenant, activate the incident runbook,
preserve the job and audit export, inspect provider object/version metadata, and
record the recovery decision. Never recreate an object under the original key as
proof of restoration; attach a new verified object through the normal evidence
workflow and preserve the deletion history.
