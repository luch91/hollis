# Backup and Recovery Runbook

Status: required before production activation. This document does not claim that a backup, point-in-time recovery, or restoration exercise is currently configured.

## Purpose

Recover Hollis transactional data and evidence availability after accidental deletion, corruption, service failure, or a verified security incident. Preserve tenant isolation, append-only review history, evidence integrity, and the distinction between private evidence and public-safe attestation files.

## Required recovery objectives

Before production, the service owner must approve and record:

- recovery point objective for PostgreSQL;
- recovery time objective for the API, web application, database, evidence storage, and retention job;
- retention duration and geographic placement for database backups and evidence versions;
- the responsible incident commander, data owner, and authorized recovery operator;
- the approved environment where restoration exercises occur.

Do not infer these values from a cloud-provider default or a free-plan feature.

## Preconditions

1. Backups are encrypted and access is restricted to approved recovery operators.
2. Database backups preserve the migrations and data needed to restore the exact application schema.
3. Evidence storage has an approved recovery mechanism appropriate to the selected provider, such as object versioning, provider backup, or immutable replicated copy.
4. The migration role, runtime role, backup identity, and recovery identity are separate and least-privileged.
5. Backup metadata, recovery approvals, and restoration outcomes are logged without secrets or raw evidence.

## Recovery procedure

1. Declare the incident and stop any destructive, retention, migration, or deployment work affecting the impacted system.
2. Record the incident time, affected tenants, systems, suspected failure mode, and evidence-preservation requirements.
3. Select a recovery point approved by the incident commander and data owner. Do not restore over the production database in place without explicit authorization.
4. Restore into an isolated recovery environment with private network access and no production write credentials.
5. Apply the repository's reviewed migration path only when required to read the restored data. Do not disable row-level security or grant runtime mutation privileges as a shortcut.
6. Validate restored database integrity: tenant isolation, migration journal, review-event sequences and hash links, policy bindings, evidence metadata, and public case-file immutability.
7. Validate evidence integrity using object references, expected digests, media types, sizes, retention state, and legal holds. Do not bulk-download evidence unless the approved recovery plan requires it.
8. Compare expected case, evidence, and audit-event counts to the recovery-point inventory. Record discrepancies.
9. Obtain written authorization before directing traffic or application jobs to restored resources.
10. Preserve the original affected resources until the incident commander authorizes their release, subject to legal hold and forensic requirements.

## Restoration exercise

Before production, perform and record an exercise using synthetic data. It must prove:

- the selected database backup can be restored into an isolated environment;
- the restricted runtime role still cannot bypass row-level security or mutate immutable records;
- a selected tenant can read its cases and export a reproducible package after restoration;
- evidence metadata matches the recovered object state;
- retention and legal-hold jobs remain disabled until explicitly re-authorized;
- recovery logs contain no raw evidence, secret, or access-token values.

The exercise record must include date, operators, environment, recovery point, elapsed time, observed recovery point, validation results, discrepancies, and corrective actions.
