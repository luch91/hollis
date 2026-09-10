# Database Security

## Role separation

Hollis uses separate PostgreSQL roles for schema migration and application traffic.

- The migration role owns schema changes and is supplied through `DATABASE_MIGRATION_URL`.
- The runtime role is supplied through `DATABASE_URL`, or through the complete `DB_NAME`, `DB_USER`,
  `DB_PASS`, and `INSTANCE_UNIX_SOCKET` set for a platform-managed Unix-socket connection. It must
  use `NOSUPERUSER` and `NOBYPASSRLS`, and it must not own application tables or schemas.

The local Compose setup creates `hollis_app` as the restricted runtime role. Production role
creation belongs in the selected deployment infrastructure and must preserve the same restrictions.

## Tenant context

Verified Hollis-session membership resolves the active workspace, then review persistence sets
`app.tenant_id` within a transaction. Row-level security policies deny access when the relevant
setting is missing and filter access when it is present. Legacy `app.workos_organization_id`
database context exists only for historical record migration and is not an active authorization input.

Application queries still include explicit tenant predicates. Row-level security is an additional
boundary, not a replacement for authorization.

Review events have a database-generated sequence used for hash-chain ordering. Timestamps are
retained for audit display but are not used as the sole ordering key.

Evidence object metadata is tenant-isolated. The runtime role can insert and read metadata but
cannot update or delete it.

## Migration repair policy

Migration `0001` adds intake fingerprints, row-level security policies, and runtime-role privilege
restrictions. Existing cases receive a `legacy:<case-id>` fingerprint because their original intake
evidence may not be reproducible from the case row alone.

Do not roll back by disabling row-level security or restoring review-event mutation privileges. If a
deployment fails partway through, inspect the Drizzle migration journal and database catalog, then
apply a reviewed forward repair that preserves tenant isolation and append-only history.
