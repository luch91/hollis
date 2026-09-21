# Testing Hollis

## Clean-clone prerequisites

Use Node.js 22.22 or later, pnpm 10.18.3, Python 3.12, Docker with Compose, and Chromium installed through Playwright.

Repository policy also requires the authorized local Git identity and the private decision-log file supplied through the approved owner channel:

```text
git config --local user.name luch91
git config --local user.email luchijudith@gmail.com
```

Place the private decision log at `.hollis/decisions.md`. Do not commit it. CI restores a non-secret sentinel because CI verifies repository structure and history rather than private owner decisions.

Install JavaScript and browser dependencies:

```text
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

For a local diagnostic run against an already installed stable Chrome, set
`PLAYWRIGHT_BROWSER_CHANNEL=chrome`. CI always installs and runs the pinned Playwright Chromium.

Create an isolated Python environment and install the pinned contract dependencies:

```text
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -r contracts/genlayer/requirements-test.txt
```

On Unix-like systems use `.venv/bin/python` in place of `.venv\Scripts\python`.

## Repository verification

```text
pnpm verify
pnpm audit --prod
pnpm test:contracts
```

`pnpm verify` runs repository policy, format, lint, TypeScript checks, unit tests, and production builds. Database integration and browser tests have separate commands because they require PostgreSQL and browser processes.

## Database integration

Start the checked-in PostgreSQL service:

```text
docker compose up -d postgres
```

Use the dedicated local integration database settings documented in `.env.example`. Never run database preparation against a production hostname or database.

## Browser tests

```text
pnpm e2e
```

The command refuses non-local database hosts and database names that do not end in `_e2e`. It resets only the dedicated `hollis_e2e` database, applies all migrations, creates deterministic synthetic users for every workspace role, builds the API, and starts isolated API and web processes. The API harness replaces only identity-token signature verification and object bytes with deterministic local substitutes. Authorization, session storage, RLS, persistence, web rendering, and API routes use the application implementation and PostgreSQL.

The Playwright projects cover desktop Chromium, a narrow mobile viewport, and an accessibility-focused reduced-motion run. Test failures retain traces on the first retry and screenshots or video only on failure. Artifacts are ignored by Git and must not contain secrets.

Tests prefer accessible roles and names. `data-testid` is reserved for values such as the canonical
commitment summary that have no stable interactive role. State changes wait for a server response,
URL transition, visible role-based control, or `expect.poll` result. Arbitrary sleeps are prohibited.
The harness also captures transactional email in memory and exposes only synthetic delivery
metadata at its test-only `__e2e` route.

## Approved real workflow

The real workflow suite does not run from unapproved environment defaults. Supply a short-lived verified Identity Platform token and the exact approved non-production HTTPS web origin through the process environment:

```text
HOLLIS_E2E_REAL_WEB_ORIGIN=https://approved.example \
HOLLIS_E2E_REAL_ALLOWED_ORIGIN=https://approved.example \
HOLLIS_E2E_REAL_IDENTITY_TOKEN=short-lived-token \
HOLLIS_E2E_APPROVED_ENVIRONMENT=evaluation \
HOLLIS_E2E_REAL_REVIEW_CASE_ID=ready-synthetic-case-uuid \
HOLLIS_E2E_REAL_WORKSPACE_NAME="Isolated QA workspace" \
HOLLIS_E2E_REAL_PROTECTION_BYPASS_SECRET=optional-provider-automation-secret \
pnpm e2e:real
```

The origin and explicit allowlist value must match exactly. The environment class must be
`evaluation`, `staging`, or `test`; known production Hollis hosts are rejected. Use an isolated
workspace and a fresh, unassigned synthetic case with verified evidence. The suite claims and
completes that case, exports it from two separately established sessions, checks it with an
independent canonicalizer, verifies the UI and attestation panel, and signs out. Record the commit,
deployment and provider identifiers, synthetic workspace/account/case identifiers, artifact paths,
and cleanup result in a dated QA record. Never put the token in that record or invoke the suite with
credentials on a shared command line. The real workflow configuration disables Playwright tracing so
the identity token cannot be retained in a trace archive; failure screenshots must be reviewed before
retention. For a protected Vercel preview, provide the project's short-lived Protection Bypass for
Automation secret through `HOLLIS_E2E_REAL_PROTECTION_BYPASS_SECRET`. The runner sends it only as
Vercel's documented request header and asks Vercel to establish its bypass cookie. Revoke the secret
after the run.

Never write the token to a file, command transcript, Playwright attachment, screenshot, or report. The test establishes a real Hollis session, visits the primary application surfaces, exports the nominated completed case twice, recomputes its canonical commitment with an independent implementation, confirms the same value in the case UI, revokes the session, and verifies protected access is gone. Provider-specific workflow tests must use isolated synthetic records and approved namespaces.

On Windows, the upstream GenLayer direct VM currently cannot release its stdin temporary file. Those direct VM tests are skipped locally with the limitation stated in the test result; the Linux CI job runs the complete pinned suite.

## Test evidence

### Independent audit-chain verification

Download the authorized JSON export, then run the verifier outside the API process.
The tenant ID is required because it is part of each event digest; do not place it in
the export itself or in a public case file.

```powershell
$env:HOLLIS_AUDIT_TENANT_ID = "<authorized workspace UUID>"
$env:HOLLIS_AUDIT_CHECKPOINT_PUBLIC_KEY_BASE64 = "<optional configured Ed25519 SPKI key>"
node scripts/verify-review-export.mjs .\case-export.json
```

The command exits non-zero for altered, missing, reordered, duplicated, or forked
events. When an export contains a checkpoint, provide its configured public key
to verify the signature and checkpoint coverage too. A verified chain is
necessary but not sufficient for a production release.

For retention-job recovery and supported-provider version-expiry procedures, use
the [evidence-retention runbook](runbooks/evidence-retention.md).

For a release record, capture the commit, environment name, execution date, operator, command results, synthetic record identifiers, cleanup result, and artifact location. Do not retain raw evidence, policy source files, credentials, signed URLs, or identity tokens.
