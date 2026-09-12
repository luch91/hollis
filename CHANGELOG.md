# Changelog

All notable Hollis changes are recorded here. The project is currently pre-release, and no versioned release or Git tag has been published.

## Unreleased

### Added

- Petrol workspace interface with responsive dark and light appearances.
- Tenant-scoped search for cases, policy controls, and reviewers.
- Public product documentation covering onboarding, policies, evidence, review, attestations, exports, administration, and troubleshooting.
- Hollis vector mark, application icon, brand guidance, and export watermark assets.
- Professional Hollis Case References and descriptive case-export filenames.
- Read-only workspace administration for members with `workspace:read`.
- Tenant-scoped reviewer identity resolution for human-readable assignments.

### Changed

- Replaced connector-style review graphics with a structured evidence, policy, human-decision, and attestation horizon.
- Kept primary application navigation in the top workspace header and renamed Dashboard to Overview.
- Reduced the documentation menu footprint and removed redundant section search fields in favor of tenant-scoped global search.
- Updated PDF and DOCX exports to use a restrained Hollis watermark instead of a header logo.
- Limited the read-only member directory to the current member's email address and non-sensitive identity fields for other members.
- Standardized case-intake terminology: `New review case` opens the intake page, while `Create review case` submits and records the completed intake.
- Limited auditor case views to inspection and export controls, with explicit read-only guidance instead of inaccessible mutation controls.

### Fixed

- Corrected ambiguous PostgreSQL column references in guarded organization-profile updates.
- Prevented read-only auditors from opening the case-intake form or seeing evidence, review, and attestation mutation controls.

### Security

- Added explicit `workspace:read` authorization for workspace profile and privacy-limited directory reads.
- Preserved owner and administrator checks for profile mutation, invitations, role changes, and revocation.
- Added database functions and integration coverage for tenant-scoped member identity and read-only directory access.

### Known issues

- A successful case-intake operation can be presented as a generic review-service failure after the record and verified evidence have been committed.
- Public case-file publication and Studio Dev import are disabled until the required public API and contract settings are configured and verified.

See [the 2026-09-12 interactive QA report](docs/qa-report-2026-09-12.md) for the evidence and exact test boundary.
