# Release readiness snapshot: 2026-09-12

> Historical snapshot. This document preserves the state observed on 2026-09-12. For the current evaluation deployment and remaining release controls, see [release-readiness-2026-09-16.md](release-readiness-2026-09-16.md).

This snapshot reconciles the current repository, local interactive QA, and known deployment boundary. It supplements the broader [production readiness review](production-readiness-2026-09-10.md) and does not certify a production deployment.

## Repository state reviewed

- Branch: `main`
- Authorized Git identity: `luch91 <luchijudith@gmail.com>`
- Remote: `https://github.com/luch91/hollis.git`
- Local branch state before this cleanup: three commits ahead of `origin/main`, with additional uncommitted product and documentation changes
- Package version: `0.1.0`
- License: MIT

No commit, push, tag, GitHub release, deployment, cloud resource, or account-plan change is part of this cleanup.

## Included in the current unreleased worktree

- Petrol workspace interface with responsive dark and light appearances
- Hollis vector mark and controlled brand assets
- public product documentation and legal-information routes
- tenant-scoped global workspace search
- professional case reference and export filenames
- PDF and DOCX export watermark treatment
- human-readable reviewer identity resolution
- workspace read permission and read-only Admin experience for non-administrative members
- privacy-limited member directory for read-only access
- database migrations `0031_add_workspace_member_identity_function` and `0032_allow_read_only_workspace_directory`
- database migration `0033_fix_workspace_profile_column_references`
- role-aligned case intake and read-only auditor case views

The exact user-visible and internal changes are summarized under `Unreleased` in the repository changelog.

## Verification evidence

The dated [interactive QA report](qa-report-2026-09-12.md) records the local browser workflow and its test boundary. The following repository checks were completed after the documentation cleanup:

| Check | Result |
| --- | --- |
| `pnpm verify` | Passed repository policy, formatting, lint, TypeScript checks, 7 shared-contract tests, 32 web tests, 82 API tests, and all production builds. Lint reported 29 existing non-failing stylesheet warnings. |
| `pnpm audit --prod` | Reported no known production dependency vulnerabilities. |
| Database integration | 10 tenant-isolation and runtime-grant tests passed against the local Compose database. |
| API persistence integration | 7 review-workflow persistence tests passed against the local Compose database. |
| `git diff --check` | Passed with no whitespace errors. |

These checks validate the repository and local persistence boundary. They do not supersede the interactive defects or outstanding real-provider and production-environment tests.

## Release blockers

1. Successful case intake can be presented as a generic service failure even though the case and verified evidence were committed.
2. No verified public HTTPS API origin is configured for privacy-safe case files.
3. The Studio Dev contract address is intentionally unset until the public attestation path is deliberately enabled.
4. Real evidence-provider acceptance, live identity-provider acceptance, shared rate limiting, observability, backup restoration, incident response, and independent security review remain incomplete.
5. The selected AWS API runtime remains blocked by the `eu-west-1` Standard-instance quota. The last launch reported an applied limit of 1 vCPU, while the approved `t3.micro` requires 2 vCPUs, and AWS Support confirmed that the existing quota request remains under review. The AWS account must remain on its current free plan unless the owner explicitly authorizes a change.

## Release discipline

- Do not tag or publish version `0.1.0` as production-ready while the blockers above remain open.
- Do not deploy the web application against an unverified or web-only API origin.
- Do not enable public attestation with a private hostname, an incorrect Studio Dev contract, or raw evidence in the public case file.
- Do not represent Studio Dev process attestations as proof of legal compliance, fairness, or private-evidence truth.
- Do not commit provider credentials, local sessions, invitation tokens, synthetic evidence, or the private decision log.
- Use only the authorized repository identity and a focused conventional commit after the owner approves committing.
