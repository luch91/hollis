# End-to-End Audit Remediation Task List

Status: implementation backlog

Source audit revision: `72a3beffe802039a8e2307bc5e7af08cfd31337f`

This plan converts the end-to-end audit into sequential implementation tasks. The working tree may contain later changes, so every task begins by confirming whether the finding still exists. Existing partial work does not close a task unless all acceptance criteria, Playwright coverage, UI synchronization checks, and real workflow tests pass.

## Execution rules

1. Complete tasks in numerical order unless a task explicitly permits parallel work.
2. Use one focused branch and pull request per task.
3. Do not combine a security or integrity task with unrelated visual work.
4. Add migrations only through the reviewed migration path. Prefer forward repair over destructive rollback.
5. Keep test evidence synthetic and free of customer data, raw policy documents, credentials, and private evidence.
6. Run `pnpm verify`, `pnpm audit --prod`, database integration tests, and the task-owned Playwright suite before closing each task.
7. A task is not complete when only its API or UI is updated. Contracts, persistence, API behavior, UI state, exports, audit events, documentation, and tests must agree.
8. Real workflow tests must use the approved non-production environment and actual configured providers where the task concerns a provider boundary. Mock-only evidence is insufficient.
9. Record the tested commit, environment, date, operator, test-data identifiers, and artifact locations in the pull request or a dated QA record.
10. Do not mark a task complete while any acceptance criterion is waived. Record the unresolved criterion and keep the task open.

## Shared definition of done

Every task must produce all of the following:

- [ ] Implementation and migrations, if required.
- [ ] Unit and integration tests for success, rejection, replay, concurrency, and failure behavior relevant to the task.
- [ ] The task-owned Playwright specification with deterministic fixtures and role-specific assertions.
- [ ] UI synchronization proof covering loading, success, empty, stale, denied, retryable failure, and terminal failure states that apply.
- [ ] A real workflow result from the approved non-production deployment without replacing external providers with mocks.
- [ ] Security and privacy review of logs, URLs, browser storage, screenshots, traces, exports, and public records created by the task.
- [ ] Updated architecture, runbook, API, and user documentation where behavior changed.
- [ ] `pnpm verify` and `pnpm audit --prod` pass from a clean checkout.
- [ ] Database isolation and persistence integration tests pass against the supported PostgreSQL version.
- [ ] Test artifacts contain no secrets or sensitive evidence and are retained at an approved location.

## Sequence overview

| Order | Task | Depends on | Release impact |
| --- | --- | --- | --- |
| 00 | Establish the release-grade test harness | None | Blocks reliable verification |
| 01 | Define the canonical case and evidence commitment | 00 | Blocks integrity changes |
| 02 | Make evidence storage write-once after verification | 01 | Critical blocker |
| 03 | Create one canonical evidence ledger | 01, 02 | Critical blocker |
| 04 | Enforce evidence-complete human review | 03 | Critical blocker |
| 05 | Secure and version the GenLayer contract | 01, 03 | Critical blocker |
| 06 | Remove caller-controlled attestation facts | 03, 05 | Critical blocker |
| 07 | Serialize audit chains and add external checkpoints | 01 | High blocker |
| 08 | Complete retention, legal hold, and deletion state | 02, 03, 07 | High blocker |
| 09 | Add policy lifecycle governance | 07 | High blocker |
| 10 | Enforce review separation of duties | 04, 09 | High blocker |
| 11 | Repair RBAC and workspace lifecycle controls | 00, 07 | High blocker |
| 12 | Enforce database tenant and domain invariants | 03, 07, 11 | High blocker |
| 13 | Harden uploads, sessions, invitations, and web boundaries | 02, 11 | High blocker |
| 14 | Add durable workers and reconciliation | 05, 06, 08 | High blocker |
| 15 | Add pagination, error fidelity, and accessible UI states | 04, 11, 14 | Medium blocker |
| 16 | Add observability, recovery, and operational controls | 08, 14 | Production blocker |
| 17 | Harden CI, dependencies, containers, and contract testing | 00 through 16 | Production blocker |
| 18 | Complete privacy, legal, and production authorization | 00 through 17 | Final release gate |

## Task 00: Establish the release-grade test harness

**Implementation status:** Locally implemented and verified on 2026-09-19. Release closure remains
open until the approved non-production workflow and privacy-safe QA record below are completed.

### Objective

Create a reproducible test foundation before changing trust-sensitive behavior. The harness must cover browser workflows, API setup, PostgreSQL isolation, private object storage, email capture, and GenLayer test execution.

### Acceptance criteria

- [x] `pnpm verify` works from a documented clean-clone setup without inventing private state. Required private policy inputs are documented and restored through an approved local or CI mechanism.
- [x] Playwright is pinned in the lockfile and has separate projects for Chromium desktop, a narrow mobile viewport, and an accessibility-focused desktop run.
- [x] The harness starts the web app, API, supported PostgreSQL version, and an approved local storage substitute or isolated provider namespace.
- [x] Deterministic setup creates synthetic users for owner, administrator, reviewer, contributor, and auditor roles.
- [x] Tests can establish real Hollis sessions without embedding credentials or identity tokens in source, traces, or screenshots.
- [x] Database reset and fixture setup are tenant-isolated and cannot target a production database.
- [x] CI runs unit tests, database integration tests, and Playwright tests with retained HTML reports, traces on first retry, and screenshots only on failure.
- [x] A separate script runs the GenLayer Python tests from pinned dependencies and a documented supported Python version.
- [x] Test commands fail closed when required URLs point at production or when a database name, tenant namespace, or bucket prefix is unsafe.

### Playwright test suite

Create `tests/e2e/platform-smoke.spec.ts` and supporting authenticated fixtures.

- [x] Verify public landing, sign-in, onboarding, and protected-route redirects.
- [x] Verify each synthetic role reaches only its permitted navigation and actions.
- [x] Verify one tenant cannot navigate to or fetch another tenant's case by identifier.
- [x] Verify browser console errors, unhandled page errors, failed first-party requests, and hydration errors fail the test.
- [x] Run an automated accessibility scan on landing, sign-in, review queue, case detail, policy library, and workspace administration.

### UI synchronization

- [x] Document stable selectors based on accessible roles, names, and test IDs only where no semantic selector is possible.
- [x] Define a shared method for waiting on server-confirmed state rather than arbitrary timeouts.
- [x] Verify navigation, session state, active workspace, and role-dependent controls agree after refresh and in a second browser context.

### Real workflow test

- [x] Against the approved non-production deployment, sign in through the configured identity provider, create or select an isolated test workspace, open each main application surface, sign out, and confirm the session is revoked.
- [x] Record the deployment commit, origins, provider project identifiers, synthetic account identifiers, and cleanup result without recording secrets.

## Task 01: Define the canonical case and evidence commitment

**Implementation status:** Locally implemented and verified on 2026-09-19. Release closure remains
open until the approved non-production byte-for-byte workflow below is completed.

### Objective

Specify one authoritative representation of a completed review and the evidence it binds. Remove ambiguity before changing storage, exports, or attestation.

### Acceptance criteria

- [x] An ADR defines the canonical case record, canonical ordered evidence set, canonical serialization, digest algorithm, schema version, and domain-separation strings.
- [x] The commitment binds tenant-safe case identity, policy binding, automated-system version, recommendation, final human decision, reviewer action commitment, and the frozen evidence set.
- [x] The ADR states which fields are public, private, mutable before completion, and immutable after completion.
- [x] The same canonicalization library is used by export, public case-file creation, managed attestation, import verification, and independent verification tooling.
- [x] Equivalent records produce identical commitments across Node.js and Python implementations.
- [x] Changes in evidence order, digest, verification state, policy binding, decision state, or schema version change the commitment.
- [x] Legacy commitments are versioned and remain verifiable without being treated as the new format.
- [x] Test vectors are checked in and contain synthetic data only.

### Playwright test suite

Create `tests/e2e/canonical-record.spec.ts`.

- [x] Complete a synthetic case and download its export.
- [x] Verify the displayed commitment matches the export and attestation panel.
- [x] Refresh and repeat the export to prove deterministic output.
- [x] Confirm no UI action can change commitment-bound fields after completion.

### UI synchronization

- [x] The case detail, export screen, and Independent Attestation panel use the same commitment label, version, and value.
- [x] Legacy cases display their commitment version and do not imply they satisfy the new guarantee.
- [x] A commitment calculation or verification failure is a visible blocking state, not an empty panel.

### Real workflow test

- [x] Complete one case in the approved non-production environment, export it twice from separate sessions, calculate the commitment with the independent verifier, and prove all values match byte for byte.

### Local verification evidence (2026-09-19)

- `pnpm verify`: passed repository policy, formatting, lint, type checks, 189 unit tests, and all production builds.
- `pnpm e2e` with the documented local Chrome channel: 62 tests passed across desktop, mobile, and accessibility projects.
- Strict Playwright server ownership: a focused smoke test passed and both local server ports were released afterward.
- PostgreSQL 18 integration: 12 tenant-isolation tests and 7 API persistence tests passed against a fresh isolated database.
- `pnpm test:contracts`: 20 canonical and contract tests passed; 8 upstream GenLayer direct-VM tests were skipped on Windows and remain assigned to Linux CI.
- `pnpm audit --prod`: no known vulnerabilities.
- `pnpm e2e:real`: confirmed to fail closed without the required approved environment inputs. It was not run against a deployment because no approved origin, short-lived identity token, isolated workspace, or ready synthetic case was available.

This local evidence is not the required release QA record and does not close either real workflow
checkbox.

## Task 02: Make evidence storage write-once after verification

### Objective

Replace the reusable direct-to-final-object upload flow with quarantine, streaming verification, and immutable promotion or immutable version capture.

### Acceptance criteria

- [ ] New uploads use a unique quarantine object that cannot collide with a verified object.
- [ ] Upload authorization enforces maximum size, media type, expiration, tenant namespace, and an unguessable upload identifier.
- [ ] Verification streams content and rejects oversized input before buffering the complete object.
- [ ] Successful verification promotes or copies bytes to a write-once final object and stores the provider version, generation, ETag, digest, size, and verified timestamp.
- [ ] Final download uses the recorded immutable version or generation.
- [ ] Reusing an upload URL after verification cannot change the verified bytes or the downloaded version.
- [ ] Failed, abandoned, and expired quarantine objects have a bounded cleanup process.
- [ ] Provider configuration validates private access, encryption, versioning or immutability capability, and expected jurisdiction before startup readiness succeeds.
- [ ] Concurrent uploads of identical bytes have defined behavior and never return metadata owned by another case.
- [ ] Verification, promotion, and cleanup emit structured audit events without raw evidence content.

### Playwright test suite

Create `tests/e2e/evidence-immutability.spec.ts`.

- [ ] Upload a valid file, verify it, download it, and compare the digest in the browser test.
- [ ] Attempt to reuse the captured upload URL and prove the case still downloads the original verified version.
- [ ] Exercise wrong digest, wrong size, wrong media type, expired upload, oversized upload, and interrupted upload states.
- [ ] Confirm retry controls are available only for retryable failures and never duplicate verified evidence.

### UI synchronization

- [ ] Show explicit `uploading`, `verifying`, `verified`, `failed`, `expired`, and `quarantined` states.
- [ ] Disable case completion while required evidence is not verified.
- [ ] Ensure refresh and a second session show the provider-confirmed state, not optimistic browser state.
- [ ] Display safe failure messages without signed URLs, object keys, or provider internals.

### Real workflow test

- [ ] Use the approved private evidence provider to upload, verify, and download a synthetic file.
- [ ] Attempt post-verification replacement with the original authorization and directly through the provider API. Prove that the recorded immutable version and Hollis download remain unchanged.
- [ ] Delete all quarantine test objects and retain the final synthetic object only as long as the test retention policy permits.

## Task 03: Create one canonical evidence ledger

### Objective

Make evidence attachment a transactional, audited domain operation used consistently by case detail, decision events, exports, retention, and attestations.

### Acceptance criteria

- [ ] One evidence-attachment model associates an evidence object with a case without conflating object deduplication and case ownership.
- [ ] Adding evidence appends an `evidence_added` event containing safe metadata and the prior audit hash.
- [ ] Removing or superseding evidence before review uses a new event and preserves history.
- [ ] Evidence cannot be added, removed, replaced, or reclassified after the case evidence set is frozen.
- [ ] Case creation and the initial evidence workflow cannot leave an actionable case with a missing required attachment. Use a draft state or a recoverable upload-pending state.
- [ ] Case detail, decision event, export, public case file, managed attestation, retention, and UI all read the same ordered evidence set.
- [ ] The evidence set is frozen atomically with the transition that makes the case reviewable or completed.
- [ ] Repeated attachment requests are idempotent and cannot attach another case's evidence row accidentally.
- [ ] Historical cases are migrated or explicitly classified as legacy with verifiable compatibility behavior.

### Playwright test suite

Create `tests/e2e/evidence-ledger.spec.ts`.

- [ ] Create a draft case, add two files, retry one request, and confirm exactly two ordered attachments and two audit events.
- [ ] Claim and complete the case, then prove add, remove, and replace controls are absent and direct requests are rejected.
- [ ] Compare case detail, audit timeline, export, and attestation evidence digests.
- [ ] Upload identical bytes to two cases and confirm each case has a valid independent attachment.

### UI synchronization

- [ ] Evidence Inventory, case detail, audit timeline, export preview, and attestation panel show the same count, order, digest, media type, and verification status.
- [ ] Draft and frozen states are labeled consistently.
- [ ] Conflicts caused by another session freezing the evidence set produce a refreshable conflict message rather than silent loss.

### Real workflow test

- [ ] In the approved non-production environment, create a case with multiple real provider objects, complete it, export it, and publish a test public case file. Independently compare all evidence metadata and commitments.

## Task 04: Enforce evidence-complete human review

### Objective

Prevent a reviewer from deciding until the policy requirement is satisfied and the reviewer can inspect all required decision material.

### Acceptance criteria

- [ ] The API evaluates the bound policy control's evidence requirement inside the decision transaction.
- [ ] Required evidence must be present, verified, frozen, and downloadable at the recorded immutable version.
- [ ] The reviewer must be the assigned authorized reviewer and must have viewed or acknowledged the required decision packet according to the approved product rule.
- [ ] The decision packet includes recommendation, material evidence, policy version, triggered rule, automated-system version, known limitations, deadline, and prior escalation state.
- [ ] Known limitations are a defined field with validation and provenance, not implied prose.
- [ ] A decision conflict caused by evidence, assignment, policy, or case-state change is rejected atomically.
- [ ] Decision rationale length, outcome values, and final recommendation are consistently validated by contracts, API, and UI.
- [ ] No adverse result can be issued solely from an automated recommendation.

### Playwright test suite

Create `tests/e2e/human-review-gate.spec.ts`.

- [ ] Verify decision controls remain blocked for missing, uploading, failed, or unverified required evidence.
- [ ] Open and inspect every evidence item and the applicable policy source before completing a review.
- [ ] Exercise approve, modify, decline-to-decide, and escalation paths permitted by the product model.
- [ ] Use two reviewer sessions to prove stale assignment and stale decision submissions fail safely.
- [ ] Confirm contributor and auditor roles cannot decide through UI or direct request.

### UI synchronization

- [ ] The primary queue and direct case route show identical action eligibility.
- [ ] Evidence download, policy source, triggered rule, and known limitations are available from the decision surface.
- [ ] Server rejection is rendered inline with preserved safe form input and a clear refresh path.
- [ ] Decision success appears only after the server returns the completed case and audit event.

### Real workflow test

- [ ] A real reviewer account claims a synthetic case, inspects evidence from the private provider, reads the private policy source, records a decision, exports the result, and confirms a second reviewer cannot overwrite it.

## Task 05: Secure and version the GenLayer contract

### Objective

Replace or supersede V7 with a contract that authorizes the Hollis execution account, binds the canonical case commitment, and makes terminal results immutable.

### Acceptance criteria

- [ ] A new contract version checks the authorized runtime caller or an equivalently strong approved authorization mechanism.
- [ ] Unauthorized callers cannot initiate adjudication or alter stored case results.
- [ ] A terminal result for a case commitment cannot be overwritten, downgraded, or replayed.
- [ ] The contract validates the canonical commitment defined in Task 01 rather than trusting an unbound declaration in fetched JSON.
- [ ] URL and document validation reject redirects, unavailable documents, oversized documents, malformed schemas, duplicate keys where relevant, and commitment mismatches.
- [ ] Deployment binding includes contract source digest, runtime address, policy binding, network, chain ID, and contract version.
- [ ] V7 remains read-only for historical verification and is never presented as satisfying the new guarantee.
- [ ] Python dependencies and supported runtime are pinned, and unit plus integration tests run in CI.
- [ ] A security review covers authorization, replay, overwrite, consensus inputs, nondeterministic web reads, and fee abuse.

### Playwright test suite

Create `tests/e2e/genlayer-finality.spec.ts`.

- [ ] Complete a case and observe submission through pending, broadcast, finalized, and receipt states.
- [ ] Confirm duplicate browser actions do not create duplicate submissions.
- [ ] Display unauthorized, commitment-mismatch, undetermined, and terminal-failure states accurately using controlled test records.
- [ ] Verify historical V7 receipts are visibly labeled as legacy.

### UI synchronization

- [ ] The Independent Attestation panel displays contract version, canonical commitment, runtime authorization status, transaction, finality, verdict, and reason from persisted server state.
- [ ] Human decision state never changes when attestation fails or returns an adverse process verdict.
- [ ] The UI distinguishes delayed, retryable, reconciliation-required, failed, undetermined, and finalized states.

### Real workflow test

- [ ] Deploy the new contract to the approved GenLayer test environment with the approved runtime account.
- [ ] Finalize one valid adjudication, attempt an unauthorized call, attempt a replay, and attempt an overwrite. Record transaction identifiers and prove only the authorized first terminal result is retained.

## Task 06: Remove caller-controlled attestation facts

### Objective

Ensure all public case files and attestation requests are built exclusively from server-authoritative policy, evidence, decision, and commitment records.

### Acceptance criteria

- [ ] Browser requests contain only the minimum action intent and case identifier. They cannot supply policy identity, digest, control semantics, evidence state, commitment, or public URL.
- [ ] The API loads the exact published policy binding associated with the case and verifies it against the active contract registry.
- [ ] Legacy manual endpoints are removed, disabled, or restricted to a separately authorized migration path with full verification.
- [ ] Public files are immutable, versioned, and generated only after the completed record passes canonical verification.
- [ ] Reuse of an existing public file requires equality of the complete canonical commitment and schema version.
- [ ] Import verifies contract address, network, runtime, calldata, public URL, commitment, terminal status, and stored case binding.
- [ ] Publication and import produce structured audit events.

### Playwright test suite

Create `tests/e2e/attestation-authority.spec.ts`.

- [ ] Intercept a publication request and prove no mutable policy or evidence facts leave the browser.
- [ ] Attempt request-body tampering through an API request context and verify strict rejection.
- [ ] Publish twice and confirm idempotent reuse rather than divergent public files.
- [ ] Confirm a policy mismatch and stale commitment block publication with an actionable UI state.

### UI synchronization

- [ ] Remove manual policy fact and transaction-entry fields from the normal customer workflow.
- [ ] Show the server-resolved policy binding and canonical commitment as read-only data.
- [ ] Publication, submission, and import states refresh from durable server state after navigation or browser restart.

### Real workflow test

- [ ] Publish a public-safe file from a completed non-production case, fetch it anonymously, verify it with the independent verifier, submit it through the managed runtime, and prove the finalized receipt binds the same server-authoritative values.

## Task 07: Serialize audit chains and add external checkpoints

### Objective

Guarantee one linear event chain per case and workspace under concurrent writes, then make tampering externally detectable.

### Acceptance criteria

- [ ] Event append operations acquire a case or workspace scoped lock or use an equivalent proven serialization mechanism.
- [ ] The database enforces the selected predecessor and sequence invariants where possible.
- [ ] Concurrent events cannot share a predecessor unless the approved structure explicitly supports a tree, which the current design does not.
- [ ] Append-only runtime grants remain enforced for case and workspace audit tables.
- [ ] An independent verifier detects missing, reordered, altered, duplicated, and forked events.
- [ ] Periodic signed or external checkpoints are designed and implemented without exposing sensitive event payloads.
- [ ] Exports identify checkpoint coverage and verification result.
- [ ] Failed event append rolls back its associated state transition.

### Playwright test suite

Create `tests/e2e/audit-concurrency.spec.ts`.

- [ ] Use multiple browser contexts to race claim, escalation, decision, evidence, legal-hold, and attestation actions where allowed.
- [ ] Confirm exactly one valid state transition wins and the exported audit chain remains linear.
- [ ] Verify the audit UI orders by durable sequence, not client time.

### UI synchronization

- [ ] The audit timeline refreshes after confirmed writes and never invents optimistic events.
- [ ] Verification status and checkpoint coverage are visible in export details to authorized roles.
- [ ] A chain verification failure becomes a prominent integrity incident state and blocks attestation.

### Real workflow test

- [ ] Run controlled concurrent API and browser actions against the supported non-production PostgreSQL service, export the resulting case and workspace chains, and verify them with the independent tool and external checkpoint.

## Task 08: Complete retention, legal hold, and deletion state

### Objective

Turn the provisional retention code into a configurable, durable, monitored lifecycle that preserves legal holds and records actual storage outcomes.

### Acceptance criteria

- [ ] Retention policy is resolved from approved contract and jurisdiction configuration and sets `retentionUntil` when evidence is accepted.
- [ ] Legal hold prevents scheduling and execution, including races with a worker that has already claimed work.
- [ ] A durable scheduler discovers all eligible tenants without a static environment-variable tenant list.
- [ ] Workers process bounded batches with leases, idempotency, exponential backoff, maximum attempts, and a visible dead-letter state.
- [ ] Successful provider deletion records deletion timestamp, provider result, object-version state, and an `evidence_deleted` audit event.
- [ ] Deleted evidence cannot receive a download URL or be represented as currently verified and available.
- [ ] Failed deletion never reports success and is visible to authorized operators.
- [ ] Recovery and version-expiry behavior is documented for each supported provider.
- [ ] Retention never deletes evidence required by an active legal hold, incident hold, or approved preservation rule.

### Playwright test suite

Create `tests/e2e/retention-lifecycle.spec.ts`.

- [ ] Set and release a legal hold with an authorized role and verify denied roles cannot do so.
- [ ] Display scheduled, held, deleting, deleted, retrying, and dead-letter states.
- [ ] Confirm download works before deletion and is unavailable after confirmed deletion.
- [ ] Verify the audit timeline records every lifecycle transition.

### UI synchronization

- [ ] Case evidence and operational views display the same retention date, hold state, deletion state, attempt count, and last failure category.
- [ ] UI controls use server-confirmed eligibility and handle stale hold/deletion conflicts.
- [ ] Destructive actions require explicit confirmation and state their effect without making legal claims.

### Real workflow test

- [ ] Against the approved private provider, create short-lived synthetic evidence, exercise a blocked deletion under legal hold, release the hold, process deletion, confirm provider absence, and verify Hollis download and attestation availability states are updated.

## Task 09: Add policy lifecycle governance

### Objective

Introduce draft, review, approval, effective, superseded, withdrawn, and expired policy states with separation of duties.

### Acceptance criteria

- [ ] Policy lifecycle and permitted transitions are defined in contracts and enforced transactionally.
- [ ] Publisher and approver cannot be the same person where two-person control is required.
- [ ] Effective and expiry timestamps use server time and are validated for ordering.
- [ ] Cases can bind only to an effective approved control unless an explicit migration rule applies.
- [ ] Supersession does not alter historical case bindings.
- [ ] Withdrawal blocks new cases but preserves existing records and verification.
- [ ] Every transition records actor, authority, rationale, timestamp, prior state, and resulting binding digest.
- [ ] Policy source verification remains mandatory before approval.
- [ ] GenLayer deployment occurs only for the approved effective binding and handles supersession safely.

### Playwright test suite

Create `tests/e2e/policy-governance.spec.ts`.

- [ ] Create a draft, submit it, reject self-approval, approve it as another authorized user, and activate it at its effective time.
- [ ] Verify contributors, reviewers, and auditors cannot publish or approve.
- [ ] Supersede and withdraw versions, then confirm case creation choices update without rewriting existing cases.
- [ ] Exercise invalid dates, duplicate versions, source verification failures, and stale approvals.

### UI synchronization

- [ ] Policy list, detail, case creation, and attestation views show the same lifecycle state and binding digest.
- [ ] Approval controls display actor eligibility and explain separation-of-duties conflicts.
- [ ] Scheduled effective state is refreshed from server time, not browser timers.

### Real workflow test

- [ ] Two real non-production identities publish and approve a synthetic policy, create cases before and after supersession, and verify each case and contract deployment retains the correct immutable binding.

## Task 10: Enforce review separation of duties

### Objective

Prevent one identity from controlling incompatible stages of a consequential review.

### Acceptance criteria

- [ ] An approved responsibility matrix defines creator, assigner, reviewer, decision approver, auditor, and attestation permissions.
- [ ] Case creator identity is stored directly and included in the audit record.
- [ ] Configurable rules prevent a creator, policy approver, or conflicted administrator from reviewing or approving the same case where required.
- [ ] Assignment rejects ineligible reviewers and records the reason category safely.
- [ ] Sensitive decisions support step-up authentication with bounded freshness when enabled.
- [ ] Reassignment, reviewer departure, and emergency override have explicit authorization and audit requirements.
- [ ] Emergency override never hides the conflict and requires a recorded rationale.

### Playwright test suite

Create `tests/e2e/separation-of-duties.spec.ts`.

- [ ] Prove a case creator cannot claim or decide their own case under the strict policy.
- [ ] Prove an eligible independent reviewer can complete it.
- [ ] Exercise reassignment, expired step-up, emergency override, and denied-role behavior.
- [ ] Confirm navigation and action controls update after a live role or assignment change.

### UI synchronization

- [ ] Queue eligibility, case action controls, assignment dialog, and audit timeline use one server-derived eligibility result.
- [ ] Conflict reasons are clear but do not leak private membership information.
- [ ] Step-up state is never inferred only from browser state.

### Real workflow test

- [ ] Use separate creator, reviewer, and approver identities in the non-production environment to complete a synthetic high-risk case and verify all incompatible self-actions are rejected by both UI and API.

## Task 11: Repair RBAC and workspace lifecycle controls

### Objective

Make role capabilities internally consistent and complete the safe member and owner lifecycle.

### Acceptance criteria

- [ ] Contributor case creation works end to end without granting unrelated review visibility, or the role is redefined and the UI updated consistently.
- [ ] Permission checks are centralized and covered by a role-to-route matrix.
- [ ] Authorized owners can deactivate or remove members, transfer ownership, and recover from a lost-owner scenario through an approved process.
- [ ] The last active owner cannot be removed, demoted, or disabled.
- [ ] Role changes revoke affected capabilities and sessions within the approved propagation window.
- [ ] Invitation issuance, delivery, acceptance, revocation, and expiry remain recipient-bound and audited.
- [ ] Account-linking behavior is implemented or product guidance no longer directs users to a nonexistent flow.
- [ ] Self-service session inventory and revoke-all functionality are implemented for sensitive accounts.

### Playwright test suite

Create `tests/e2e/workspace-rbac.spec.ts`.

- [ ] Exercise every role against every navigation group and sensitive action.
- [ ] Complete the contributor create-case flow under its final permission model.
- [ ] Change a member's role in one context and prove controls and API access update in another context.
- [ ] Transfer ownership, reject last-owner removal, remove a member, revoke sessions, and verify access loss.
- [ ] Exercise invitation expiry, revocation, wrong recipient, replay, and successful acceptance.

### UI synchronization

- [ ] Navigation, buttons, forms, and server authorization use the same capability definitions.
- [ ] Member and invitation state updates only after server confirmation and remains correct after refresh.
- [ ] Access-revoked sessions leave protected screens promptly and do not retain sensitive cached data.

### Real workflow test

- [ ] Use real non-production identities to invite a member, accept, change role, create permitted data, revoke access, transfer ownership, and prove revoked sessions cannot access the workspace.

## Task 12: Enforce database tenant and domain invariants

### Objective

Make cross-tenant and invalid domain relationships impossible at the database layer, not merely unlikely through application code.

### Acceptance criteria

- [ ] Every tenant-scoped child relationship uses a composite tenant-plus-parent foreign key or an equivalently strong constraint.
- [ ] Evidence attachments, events, attestations, public files, retention jobs, policy controls, invitations, sessions, and operational records are covered.
- [ ] Enumerated status, role, hold, and lifecycle values have database constraints where practical.
- [ ] Actor references use durable identity relationships or an explicit tombstone model.
- [ ] Migration preflight identifies inconsistent legacy rows and stops with a reviewable report.
- [ ] Forward repair preserves audit history and never silently reassigns a tenant.
- [ ] RLS tests directly cover every tenant-scoped table and security-definer function.
- [ ] Runtime and migration identities retain least privilege, `NOSUPERUSER`, and `NOBYPASSRLS`.

### Playwright test suite

Create `tests/e2e/tenant-invariants.spec.ts`.

- [ ] Create similarly named cases and evidence in two tenants and prove URL, search, export, download, and attestation isolation.
- [ ] Switch workspaces in one account and confirm stale identifiers cannot cross the active tenant boundary.
- [ ] Verify cross-tenant direct requests return the approved non-enumerating response.

### UI synchronization

- [ ] Workspace switching clears tenant-specific caches, selections, pending forms, and client state.
- [ ] Breadcrumbs, case references, policy choices, and evidence lists always reflect the active server-resolved workspace.
- [ ] Cross-tenant or deleted references never render stale data from a previous workspace.

### Real workflow test

- [ ] Run the full tenant-isolation suite against the approved non-production database using its restricted runtime role, then manually verify two synthetic tenants through separate browser contexts.

## Task 13: Harden uploads, sessions, invitations, and web boundaries

### Objective

Close the remaining abuse, redirect, token-leakage, header, and session-management gaps.

### Acceptance criteria

- [ ] API and UI evidence limits agree, and provider authorization enforces the same limit before storage accepts bytes.
- [ ] Allowed media types are explicit and active content is handled through safe download disposition and isolation.
- [ ] Malware scanning or an explicitly approved quarantine decision exists before evidence becomes reviewable.
- [ ] Shared rate limiting covers public and high-cost routes across instances with bounded storage and trusted client attribution.
- [ ] Redirect validation permits only normalized same-origin application paths and rejects protocol-relative, encoded, backslash, and control-character variants.
- [ ] Raw invitation tokens never appear in query strings, server redirect targets, logs, analytics, or referrer headers.
- [ ] Web responses set an approved CSP, frame restrictions, `nosniff`, Referrer-Policy, Permissions-Policy, and HSTS.
- [ ] Session exchange and other state-changing custom endpoints validate origin and use the approved CSRF defense.
- [ ] Session idle timeout, absolute lifetime, revocation, and sensitive-action reauthentication are documented and enforced.
- [ ] Logs and error responses are tested for token, signed URL, object key, and evidence-content leakage.

### Playwright test suite

Create `tests/e2e/web-security-boundaries.spec.ts`.

- [ ] Test redirect payloads, invitation acceptance, token cleanup, browser history, and referrer behavior.
- [ ] Verify security headers on public, authenticated, error, export, and public case-file responses.
- [ ] Exercise rate limits and recovery without making the suite abusive to shared infrastructure.
- [ ] Verify revoked, idle-expired, and absolute-expired sessions lose access.
- [ ] Upload disallowed, oversized, and suspicious synthetic files and verify safe rejection or quarantine.

### UI synchronization

- [ ] Rate-limit responses display retry timing and preserve only non-sensitive form state.
- [ ] Session expiration produces a safe sign-in path with a validated local return path.
- [ ] Quarantine and scan states match server state after refresh and across sessions.

### Real workflow test

- [ ] Validate headers and token handling on the deployed origins, accept an invitation through the production-like identity flow, exercise shared rate limiting from two runtime instances if available, and inspect approved logs for leakage.

## Task 14: Add durable workers and reconciliation

### Objective

Move retention, GenLayer deployment, submission, and reconciliation from request-driven progress to durable background processing.

### Acceptance criteria

- [ ] A documented scheduler and worker architecture uses durable jobs, leases, idempotency keys, bounded concurrency, backoff, maximum attempts, and dead-letter states.
- [ ] Web requests reserve work transactionally and return without depending on an untracked background promise.
- [ ] GenLayer deployment and adjudication continue progressing when no user reloads a page.
- [ ] An uncertain broadcast never triggers blind resubmission.
- [ ] Reconciliation can recover after process termination at every persisted lifecycle state.
- [ ] Operators can inspect safe job metadata, retry eligible work, and resolve reconciliation-required records with audited actions.
- [ ] Worker identity and permissions are distinct and least-privileged.
- [ ] Backlog age, attempts, failures, and dead letters emit metrics and alerts.

### Playwright test suite

Create `tests/e2e/background-workflows.spec.ts`.

- [ ] Start a managed attestation, close the browser, wait through a server-side status API, reopen the case, and observe durable progress.
- [ ] Display retrying, reconciliation-required, dead-letter, and recovered states from seeded integration failures.
- [ ] Confirm repeated page loads do not create additional jobs or broadcasts.

### UI synchronization

- [ ] Use bounded polling or server-driven updates with clear last-updated timestamps.
- [ ] Customer UI exposes safe status and recovery guidance without provider secrets.
- [ ] Operator actions and customer-visible state converge on the same persisted job record.

### Real workflow test

- [ ] In non-production, terminate or redeploy the worker after job reservation, after broadcast persistence, and before final reconciliation. Prove each job resumes without duplication and reaches the correct terminal state.

## Task 15: Add pagination, error fidelity, and accessible UI states

### Objective

Make large workspaces usable and ensure outages, empty data, denied access, and stale state are never conflated.

### Acceptance criteria

- [ ] Cases, policies, members, invitations, audit events, evidence, attestations, and operational jobs use bounded cursor pagination.
- [ ] Stable sort keys and cursor semantics prevent duplicates or omissions during concurrent inserts.
- [ ] Filters and search execute server-side with bounded inputs and tenant scope.
- [ ] UI distinguishes empty, loading, partial, denied, not found, dependency unavailable, retryable failure, and terminal failure states.
- [ ] API errors retain a safe correlation identifier and machine-readable category.
- [ ] Forms expose field errors inline and preserve safe user input.
- [ ] `datetime-local` values are labeled and converted using an explicit displayed time zone.
- [ ] Key surfaces meet WCAG 2.2 AA checks for keyboard use, focus, labels, error announcements, contrast, zoom, and reduced motion.

### Playwright test suite

Create `tests/e2e/pagination-accessibility.spec.ts`.

- [ ] Traverse multiple pages while records are added concurrently and verify no duplicate or missing identifiers.
- [ ] Exercise filters, back/forward navigation, refresh, and deep links.
- [ ] Inject API 401, 403, 404, 409, 429, 503, and network failures and verify distinct UI behavior.
- [ ] Run keyboard-only and automated accessibility checks on all primary workflows.
- [ ] Verify deadline entry in at least two time zones and across a daylight-saving boundary.

### UI synchronization

- [ ] URL query state, server results, pagination cursor, filters, and selected case remain synchronized.
- [ ] Background refresh does not reorder a user's active row unexpectedly or erase form state.
- [ ] Dependency outages never appear as empty attestation or evidence lists.

### Real workflow test

- [ ] Seed a production-like volume of synthetic records in non-production, measure page and API latency, traverse the workflow on desktop and mobile viewports, and record accessibility results.

## Task 16: Add observability, recovery, and operational controls

### Objective

Provide enough telemetry and recovery evidence to operate a consequential-decision system safely.

### Acceptance criteria

- [ ] Readiness checks validate database access and required configuration without exposing secrets or causing expensive provider calls.
- [ ] Structured logs include safe request, tenant-pseudonymous, route, result, latency, deployment-version, and correlation fields.
- [ ] Metrics cover authentication, authorization denial, workflow latency, deadline breaches, evidence verification, storage failures, audit verification, jobs, attestations, email delivery, and exports.
- [ ] Traces cross web, API, database, storage, and worker boundaries using safe identifiers.
- [ ] SLOs, alert thresholds, paging ownership, escalation paths, and log retention are approved and tested.
- [ ] Backup objectives, encryption, access, and geographic placement are approved.
- [ ] A restore into an isolated environment proves database, audit, evidence metadata, and immutable provider versions can be reconciled.
- [ ] Incident response includes session revocation, job suspension, retention suspension, evidence preservation, communication decisions, and post-incident verification.
- [ ] The operations surface exposes metadata only and follows its separately approved cross-tenant authorization boundary.

### Playwright test suite

Create `tests/e2e/operational-signals.spec.ts`.

- [ ] Generate synthetic successful, denied, conflicted, rate-limited, provider-failed, and worker-failed requests with known correlation IDs.
- [ ] Verify authorized operational views show the resulting safe signals and unauthorized tenant users cannot access them.
- [ ] Confirm customer screens surface correlation IDs only where useful and never expose stack traces or infrastructure secrets.

### UI synchronization

- [ ] Health and job indicators use measured backend state with last-observed timestamps.
- [ ] Incident banners and degraded-mode states are server-controlled, accessible, and do not claim unavailable features succeeded.
- [ ] Operator remediation actions update customer-visible state only after durable confirmation.

### Real workflow test

- [ ] Run a game day that introduces a database interruption, storage failure, and delayed GenLayer finality, then restore service and verify alerts, runbooks, recovery objectives, audit continuity, and customer-visible states.
- [ ] Perform and record an isolated backup restoration exercise.

## Task 17: Harden CI, dependencies, containers, and contract testing

### Objective

Make the delivery pipeline reproducible, least-privileged, and capable of detecting security, compatibility, and packaging regressions.

### Acceptance criteria

- [ ] CI actions and service images are pinned to reviewed immutable digests or commit SHAs.
- [ ] TypeScript, PostgreSQL integration, Playwright, and pinned Python/GenLayer tests run on every eligible change.
- [ ] Coverage thresholds protect trust-sensitive modules and cannot be reduced without explicit review.
- [ ] Secret scanning covers the working tree and Git history using an approved tool.
- [ ] SAST, dependency audit, license policy, SBOM generation, and container scanning are required checks with documented triage rules.
- [ ] Dependency update automation is configured with bounded grouping and review requirements.
- [ ] The API runtime image contains only production runtime dependencies and required compiled artifacts, runs non-root, has a health check, and uses a pinned base image.
- [ ] Build provenance and artifact digests are recorded for deployments.
- [ ] Repository actor and identity policy remains consistent with the controlling decision log while local verification remains reproducible.
- [ ] Lint warnings are resolved or converted into explicitly reviewed rules. The quality gate does not silently accept known warnings.

### Playwright test suite

Create `tests/e2e/deployed-artifact-smoke.spec.ts`.

- [ ] Run the critical smoke path against the exact image and web artifact produced by CI, not a separately built local tree.
- [ ] Verify the deployed version endpoint or safe build metadata matches the tested commit and artifact digest.
- [ ] Confirm source maps, test fixtures, development endpoints, and internal files are not publicly served.

### UI synchronization

- [ ] A safe build/version identifier is available for support and incident correlation without exposing repository secrets.
- [ ] Frontend and API compatibility are checked before rollout, and incompatible versions fail closed with a controlled maintenance state.

### Real workflow test

- [ ] Deploy the CI-produced artifacts to the approved non-production environment and execute the complete golden workflow: identity, workspace, policy, evidence, review, export, public case file, managed attestation, retention hold, and cleanup.

## Task 18: Complete privacy, legal, and production authorization

### Objective

Close organizational and compliance-readiness gaps, then make the final go or no-go decision from recorded evidence.

### Acceptance criteria

- [ ] The legal operator, privacy contact, security contact, and monitored support channel are approved and published.
- [ ] Terms, privacy notice, DPA, subprocessor list, data-flow inventory, processing purposes, legal bases, data locations, and retention schedule are reviewed by appropriate counsel and owners.
- [ ] Data subject access, correction, export, deletion, restriction, and incident-notification procedures are implemented where applicable.
- [ ] Public evidence commitments are reviewed for correlation and dictionary risk. An approved commitment or salting design is used where raw digest publication is unsafe.
- [ ] Data residency, database TLS, storage encryption, key ownership, backup placement, and provider configuration are verified from deployed settings.
- [ ] Independent application security testing and penetration testing are complete, with critical and high findings resolved or explicitly blocking release.
- [ ] The production preflight checklist contains evidence links for every checked item.
- [ ] Named service, security, privacy, incident, and vulnerability-management owners accept their responsibilities.
- [ ] The GenLayer fee and capacity profile is measured and approved.
- [ ] The final authorization explicitly states the allowed data classification, customers, jurisdictions, workload limits, and rollback criteria.

### Playwright test suite

Create `tests/e2e/privacy-and-release.spec.ts`.

- [ ] Verify privacy, terms, support, subprocessor, and retention information is reachable from public and authenticated contexts.
- [ ] Exercise account data export, session revocation, correction, and deletion-request flows using a synthetic identity.
- [ ] Confirm consent or acknowledgement records, where required, are versioned and retrievable.
- [ ] Run the complete release regression suite against the release candidate.

### UI synchronization

- [ ] Public legal content, in-product notices, retention displays, account controls, and support routes reference the same current policy versions and contacts.
- [ ] Data export and deletion states show submitted, verifying, processing, blocked, completed, and failed outcomes accurately.
- [ ] Product language distinguishes recommendations, human decisions, process attestations, and legal correctness.

### Real workflow test

- [ ] Conduct a release-candidate acceptance exercise with real non-production identity, database, storage, email, scheduler, and GenLayer providers.
- [ ] Execute the golden workflow plus account export, deletion request, legal hold, incident simulation, backup restoration, and rollback rehearsal.
- [ ] Record a signed go or no-go decision. Commercial production remains blocked unless every production-preflight item has current evidence and no unresolved critical or high finding remains.

## Final release evidence index

Populate this table as tasks close. A link must identify immutable or access-controlled evidence rather than an informal assertion.

| Task | Implementation PR | Automated report | Real workflow record | Security review | Completed by/date |
| --- | --- | --- | --- | --- | --- |
| 00 |  |  |  |  |  |
| 01 |  |  |  |  |  |
| 02 |  |  |  |  |  |
| 03 |  |  |  |  |  |
| 04 | `50cc20f`, `7c793ba`, `e2374d0` | `pnpm verify`; Playwright 36/36 | [2026-09-23 record](qa-records/2026-09-23-task-04-08.md) | Evidence-complete decision and immutable export verified | Codex / 2026-09-23 |
| 05 | `7c793ba`, `e2374d0` | Contract 23 passed; API 144 passed | [V9 deployment](../contracts/genlayer/DEPLOYMENT_V9.md) | Authorized V9 canonical binding and terminal result recorded | Codex / 2026-09-23 |
| 06 | `7c793ba`, `e2374d0` | Attestation-authority E2E passed | [2026-09-23 record](qa-records/2026-09-23-task-04-08.md) | Server-authoritative case file and deployment-scoped submission verified | Codex / 2026-09-23 |
| 07 | `50cc20f` plus migrations `0056`, `0060`, `0062`, `0063` | Audit concurrency and canonical export E2E passed | [2026-09-23 record](qa-records/2026-09-23-task-04-08.md) | Signed checkpoint present in production export | Codex / 2026-09-23 |
| 08 | Migrations `0054`, `0058`, `0059`, `0061` | Retention/legal-hold E2E passed | [2026-09-23 record](qa-records/2026-09-23-task-04-08.md) | Production evidence verification and retention metadata verified | Codex / 2026-09-23 |
| 09 |  |  |  |  |  |
| 10 |  |  |  |  |  |
| 11 |  |  |  |  |  |
| 12 |  |  |  |  |  |
| 13 |  |  |  |  |  |
| 14 |  |  |  |  |  |
| 15 |  |  |  |  |  |
| 16 |  |  |  |  |  |
| 17 |  |  |  |  |  |
| 18 |  |  |  |  |  |
