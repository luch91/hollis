# ADR 0014: Public Identity Platform authentication

## Status

Accepted

## Context

Hollis is becoming a self-service enterprise product. A person must be able to create an account,
create an isolated organization workspace, or accept an invitation to an existing workspace.

The initial WorkOS design couples browser authentication, organization membership, and API
authorization to WorkOS-specific identifiers and claims. That model does not provide the required
public registration experience and does not keep Hollis workspace authorization independent from an
identity provider.

## Decision

Use Google Cloud Identity Platform for public user authentication with these enabled methods:

- Google sign-in
- GitHub sign-in
- Verified email and password

Hollis owns organization workspaces, memberships, invitations, roles, and permissions. Identity
Platform identifies a person using a stable subject. The API resolves that subject to a Hollis user,
then resolves an active workspace only through an authenticated Hollis session and verified
membership.

An account with no workspace membership receives onboarding options only. It may create a workspace
or accept a valid invitation. It cannot read workspace data merely because it authenticated,
shares an email domain, or uses a particular sign-in provider.

Identity Platform account linking is permitted only after the authenticated account is verified and
the provider subjects resolve to the same Hollis user. Provider linkage never changes a workspace
membership or role.

## Consequences

- Google, GitHub, and email-and-password credentials are managed by Identity Platform rather than
  Hollis.
- The API verifies Identity Platform identity tokens only at session establishment. Subsequent
  Hollis sessions are opaque, revocable, expiry-bound records with an active workspace selected by
  verified membership.
- Existing WorkOS-backed records must be migrated without changing review-case, evidence-metadata,
  review-event, or tenant identifiers.
- Enterprise SAML, OIDC, SCIM, and MFA remain follow-on capabilities. They do not change the
  Hollis authorization model.
