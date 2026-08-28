# Database Security

## Role separation

Hollis uses separate PostgreSQL roles for schema migration and application traffic.

- The migration role owns schema changes and is supplied through `DATABASE_MIGRATION_URL`.
- The runtime role is supplied through `DATABASE_URL`. It must use `NOSUPERUSER` and
  `NOBYPASSRLS`, and it must not own application tables or schemas.

The local Compose setup creates `hollis_app` as the restricted runtime role. Production role
creation belongs in deployment infrastructure and must preserve the same restrictions.

## Tenant context

Organization lookup sets `app.workos_organization_id` within a transaction. Review persistence sets
`app.tenant_id` within a transaction. Row-level security policies deny access when the relevant
setting is missing and filter access when it is present.

Application queries still include explicit tenant predicates. Row-level security is an additional
boundary, not a replacement for authorization.

## Migration repair policy

Migration `0001` adds intake fingerprints, row-level security policies, and runtime-role privilege
restrictions. Existing cases receive a `legacy:<case-id>` fingerprint because their original intake
evidence may not be reproducible from the case row alone.

Do not roll back by disabling row-level security or restoring review-event mutation privileges. If a
deployment fails partway through, inspect the Drizzle migration journal and database catalog, then
apply a reviewed forward repair that preserves tenant isolation and append-only history.
