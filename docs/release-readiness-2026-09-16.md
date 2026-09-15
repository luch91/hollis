# Evaluation Release Readiness: 2026-09-16

## Status

Hollis has a verified evaluation deployment. This is not a commercial-production authorization, legal-compliance certification, or assurance that all operational controls are complete.

## Active evaluation topology

| Component | Current evaluation service | Boundary |
| --- | --- | --- |
| Web application | Vercel | Public workspace and documentation interface |
| API | Vercel, Dublin region | Authenticated domain API and public-safe case-file route |
| Database | Supabase PostgreSQL, Europe (Ireland) | Transactional tenant state and audit history |
| Evidence | Private Cloudflare R2 bucket | Raw evidence only, never public case files or exports by default |
| Identity | Google Cloud Identity Platform | Google, GitHub, and verified email-and-password identity |
| Product email | Resend | Server-side welcome-email delivery when configured |
| Attestation | GenLayer Studio Next, chain ID `61997` | Managed process attestation only |

## Verified evaluation flow

The current managed path has been exercised with synthetic data:

1. A workspace case was created under a published policy control.
2. Evidence was stored privately and verified.
3. A reviewer recorded a human decision.
4. Hollis generated a public-safe case file without raw evidence, policy source documents, personal data, prompts, or secrets.
5. Hollis reused or activated the policy-control-bound V7 GenLayer contract through its dedicated server-side execution account.
6. A Studio Next adjudication finalized, and Hollis persisted the result and portable receipt.
7. A case export was generated.

The customer workflow does not require a wallet, Studio access, or a manually entered transaction hash. Each contract is reusable for its exact tenant, published policy version, and policy control. It is not deployed once per review case.

## Current safeguards

- Tenant access is derived from a verified Hollis session and membership.
- Evidence remains private and is accessed through object-specific signed URLs.
- Published policy source documents are private, content-validated, and hashed by the server.
- Review and administrative events are append-only and hash-linked.
- A managed attestation result cannot alter the completed human decision.
- GenLayer public case files contain bounded process facts only.

## Outstanding before commercial production

- Complete controlled acceptance testing for live identity-provider flows, account linking, password recovery, session renewal, and logout.
- Complete real-provider retention, deletion-retry, legal-hold, and recovery testing for the selected evidence provider.
- Add a shared or edge rate limiter before multi-instance deployment.
- Establish monitored backups, restoration evidence, alerting, incident response, and vulnerability-management ownership.
- Complete an independent application-security review appropriate to the data and deployment scope.
- Define the separate internal Hollis Operations Console, including its platform-operator authorization and cross-tenant metadata boundary.
- Produce and review a measured Studio Next fee profile for the managed contract path.

## Documentation status

The active deployment and managed-attestation workflow are documented in [architecture.md](architecture.md), [deployment.md](deployment.md), and [public-attestation-case-files.md](public-attestation-case-files.md). Earlier QA and readiness records remain preserved as dated historical evidence and must not be used as current deployment instructions.
