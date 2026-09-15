# ADR 0010: Google Cloud evidence storage adapter

> Historical decision. The provider-neutral evidence interface remains active, but the current evaluation deployment uses private Cloudflare R2. This record preserves the original Google Cloud Storage adapter decision and must not be read as the active provider selection.

- Status: accepted
- Date: 2026-08-29

## Decision

Use Google Cloud Storage in project `hollis-507001` behind a provider-neutral `EvidenceStorage`
interface. Objects use content-addressed names under a tenant prefix. The adapter verifies the
SHA-256 digest before upload, enforces the tenant prefix for every signed URL, and issues signed
URLs that expire after fifteen minutes.

The bucket name and location are deployment configuration. The application does not create or
select a bucket implicitly. Google-managed encryption is the initial key mode. Retention and legal
holds remain controlled by the approved retention policy and must be configured before customer
evidence is stored.

## Consequences

- Storage can be tested locally without GCP credentials through an adapter double.
- Raw evidence stays outside PostgreSQL and public ledgers.
- A future provider can implement the same contract without changing review workflows.
- Production provisioning remains blocked until bucket location and retention enforcement are tested.
