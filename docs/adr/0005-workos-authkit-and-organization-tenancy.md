# ADR 0005: WorkOS AuthKit and organization tenancy

- Status: accepted
- Date: 2026-08-28

## Context

Hollis needs enterprise authentication, organization membership, role context, and a path to SSO
and directory synchronization. Tenant scope must be derived from verified identity data rather than
client-controlled request fields.

## Decision

Use WorkOS AuthKit for authentication and enterprise identity. The web application owns the AuthKit
session cookie and passes bearer access tokens to the API. The API verifies token signatures,
issuer, client ID, expiry, and required claims against the configured WorkOS JSON Web Key Set.

Every authenticated API principal must have an `org_id` claim. That claim selects the Hollis tenant
through the unique `workos_organization_id` mapping. Request bodies, query parameters, and headers
must never select or override tenant identity.

Persist only the external identifiers needed to map WorkOS organizations, users, and memberships to
Hollis records. Use the WorkOS Events API for future identity synchronization.

## Consequences

- Business endpoints remain unavailable until they enforce both authentication and authorization.
- Each deployment must configure an explicit trusted issuer and JSON Web Key Set URL.
- An authenticated user without an active organization cannot access a Hollis workspace.
- Provider replacement requires changes at the web session, token verification, and identity sync
  boundaries, but not in review-domain records.
