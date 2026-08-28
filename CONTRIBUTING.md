# Contributing

Hollis currently accepts repository modifications only from the `luch91` GitHub account using the Git identity `luch91 <luchijudith@gmail.com>`.

## Before working

1. Read `AGENTS.md`.
2. Read `.hollis/decisions.md` if the private decision log is present.
3. Review the relevant architecture decision records.
4. Confirm that the requested change does not violate a product non-negotiable.

## Change standards

- Verify facts before recording them.
- Keep changes narrow and reviewable.
- Use precise language and remove filler.
- Add or update tests for behavior changes.
- Update documentation when contracts, operations, or architecture change.
- Do not place secrets or customer data in code, fixtures, logs, screenshots, or commits.
- Do not bypass repository hooks or policy checks.

## Commit format

Use Conventional Commits with a lowercase description:

```text
feat(review): add case assignment
fix(audit): preserve event ordering
docs: clarify tenant isolation requirements
```

Each commit must represent one coherent change. Automated authorship attribution and unapproved co-author trailers are prohibited.

## Required checks

Run the complete suite before committing:

```sh
pnpm verify
```

## GitHub configuration

Repository administrators must configure the following rules for `main`:

- Restrict direct pushes to `luch91`.
- Require pull requests before merging.
- Require approval from code owners.
- Require the `quality` workflow.
- Require conversation resolution.
- Block force pushes and branch deletion.
- Prevent administrators from bypassing the rules.
- Require verified signed commits after the owner configures a signing key.
- Restrict changes to `.github`, `.githooks`, `scripts`, `AGENTS.md`, and `CODEOWNERS` to `luch91`.

The repository files cannot create these server-side controls on their own. They must be enabled in the GitHub repository settings after the remote is created.
