import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeE2eDatabase } from "./e2e-database-safety.mjs";

function withRemoteApproval(values, callback) {
  const priorHost = process.env.HOLLIS_E2E_ALLOWED_DATABASE_HOST;
  const priorEnvironment = process.env.HOLLIS_E2E_APPROVED_ENVIRONMENT;
  const priorProjectRef = process.env.HOLLIS_E2E_ISOLATED_SUPABASE_PROJECT_REF;
  try {
    if (values.host === undefined) delete process.env.HOLLIS_E2E_ALLOWED_DATABASE_HOST;
    else process.env.HOLLIS_E2E_ALLOWED_DATABASE_HOST = values.host;
    if (values.environment === undefined) delete process.env.HOLLIS_E2E_APPROVED_ENVIRONMENT;
    else process.env.HOLLIS_E2E_APPROVED_ENVIRONMENT = values.environment;
    if (values.projectRef === undefined)
      delete process.env.HOLLIS_E2E_ISOLATED_SUPABASE_PROJECT_REF;
    else process.env.HOLLIS_E2E_ISOLATED_SUPABASE_PROJECT_REF = values.projectRef;
    callback();
  } finally {
    if (priorHost === undefined) delete process.env.HOLLIS_E2E_ALLOWED_DATABASE_HOST;
    else process.env.HOLLIS_E2E_ALLOWED_DATABASE_HOST = priorHost;
    if (priorEnvironment === undefined) delete process.env.HOLLIS_E2E_APPROVED_ENVIRONMENT;
    else process.env.HOLLIS_E2E_APPROVED_ENVIRONMENT = priorEnvironment;
    if (priorProjectRef === undefined) delete process.env.HOLLIS_E2E_ISOLATED_SUPABASE_PROJECT_REF;
    else process.env.HOLLIS_E2E_ISOLATED_SUPABASE_PROJECT_REF = priorProjectRef;
  }
}

test("accepts only local databases with the E2E suffix by default", () => {
  assert.equal(
    assertSafeE2eDatabase("postgres://user:pass@127.0.0.1:5432/hollis_e2e", "test").pathname,
    "/hollis_e2e",
  );
  assert.throws(
    () => assertSafeE2eDatabase("postgres://user:pass@127.0.0.1:5432/hollis", "test"),
    /must end with _e2e/,
  );
});

test("rejects remote databases without exact evaluation approval", () => {
  withRemoteApproval({}, () => {
    assert.throws(
      () => assertSafeE2eDatabase("postgres://user:pass@evaluation.example/hollis_e2e", "test"),
      /exact remote host allowlist/,
    );
  });
});

test("accepts an exactly allowlisted remote evaluation database", () => {
  withRemoteApproval({ environment: "evaluation", host: "evaluation.example" }, () => {
    assert.equal(
      assertSafeE2eDatabase("postgres://user:pass@evaluation.example/hollis_e2e", "test").hostname,
      "evaluation.example",
    );
    assert.throws(
      () => assertSafeE2eDatabase("postgres://user:pass@other.example/hollis_e2e", "test"),
      /exact remote host allowlist/,
    );
  });
});

test("accepts only the explicitly approved Supabase project default database", () => {
  const projectRef = "bjmtbtdcfqvbylircbzy";
  const host = "aws-1-eu-west-1.pooler.supabase.com";
  withRemoteApproval({ environment: "evaluation", host, projectRef }, () => {
    assert.equal(
      assertSafeE2eDatabase(
        `postgres://hollis_app.${projectRef}:pass@${host}:5432/postgres`,
        "test",
      ).pathname,
      "/postgres",
    );
    assert.throws(
      () =>
        assertSafeE2eDatabase(
          `postgres://hollis_app.otherprojectref000@${host}:5432/postgres`,
          "test",
        ),
      /explicit isolated Supabase project/,
    );
  });
});
