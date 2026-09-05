# ADR 0013: Self-service workspace provisioning

## Status

Accepted

## Context

An authenticated user without an active WorkOS organization previously had no path into Hollis other
than manual administrator assignment. That does not support normal product onboarding and it makes
the access-denied screen misleading for legitimate new customers.

Hollis still requires tenant isolation and must not attach a user to a workspace merely because the
user can authenticate or shares an email domain.

## Decision

Allow an authenticated user with no active organization to create a workspace explicitly. The API
creates a WorkOS organization, assigns the creator the deployment-configured initial administrator
role, and records the corresponding Hollis tenant through a dedicated PostgreSQL security-definer
function.

The function is the only runtime elevation for tenant provisioning. It remains subject to the
database's row-level-security context and is executable only by `hollis_app`. Runtime table-write
privileges are not broadened.

The API requires a verified WorkOS access token, rejects a request with an active organization
context, validates the workspace name, and requires an `Idempotency-Key` header. The web application
switches the authenticated session to the newly created organization before opening the workspace.

`WORKOS_INITIAL_ADMIN_ROLE_SLUG` is an explicit deployment setting. Hollis does not assume a WorkOS
role name or permission set.

## Consequences

- New customers can create their first workspace without operator intervention.
- Workspace administrators remain responsible for invitations and membership changes.
- Automatic verified-domain enrollment and directory synchronization are not enabled by this change.
  They require separate policy and implementation decisions.
- Production requires a WorkOS API key and an initial administrator role slug in the API runtime.
