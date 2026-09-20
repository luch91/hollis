import postgres from "postgres";
import { assertSafeE2eDatabase } from "./e2e-database-safety.mjs";

const targetUrl = process.env.E2E_DATABASE_ADMIN_URL;
const action = process.argv[2];
if (!targetUrl || !["reset", "seed"].includes(action)) {
  throw new Error("Use prepare-e2e.mjs with reset or seed and E2E_DATABASE_ADMIN_URL.");
}

const parsed = assertSafeE2eDatabase(targetUrl, "E2E_DATABASE_ADMIN_URL");
const databaseName = parsed.pathname.slice(1);

if (action === "reset") {
  const maintenance = new URL(targetUrl);
  maintenance.pathname = "/postgres";
  const client = postgres(maintenance.toString(), { max: 1 });
  try {
    await client`select pg_terminate_backend(pid) from pg_stat_activity where datname = ${databaseName}`;
    await client.unsafe(`drop database if exists "${databaseName}"`);
    await client.unsafe(`create database "${databaseName}"`);
  } finally {
    await client.end();
  }
  process.exit(0);
}

const client = postgres(targetUrl, { max: 1 });
const tenantOne = "00000000-0000-4000-8000-000000000100";
const tenantTwo = "00000000-0000-4000-8000-000000000200";
const roles = ["owner", "administrator", "reviewer", "contributor", "auditor"];
const remoteSeed = !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname);
const realReviewerSubject = process.env.HOLLIS_E2E_REAL_PROVIDER_SUBJECT?.trim();
const realReviewerEmail = process.env.HOLLIS_E2E_REAL_ACCOUNT_EMAIL?.trim();
const primaryWorkspaceName =
  process.env.HOLLIS_E2E_REAL_WORKSPACE_NAME?.trim() || "E2E Primary Workspace";
if (remoteSeed && (!realReviewerSubject || !realReviewerEmail)) {
  throw new Error("Remote E2E seeding requires an explicit synthetic reviewer subject and email.");
}
try {
  await client`select set_config('app.tenant_id', ${tenantOne}, false)`;
  await client`select set_config('app.workspace_provisioning', 'enabled', false)`;
  await client`select set_config('app.identity_resolution', 'enabled', false)`;
  await client`
    insert into tenants (id, name)
    values (${tenantOne}, ${primaryWorkspaceName}), (${tenantTwo}, 'E2E Isolation Workspace')
  `;
  for (let index = 0; index < roles.length; index += 1) {
    const role = roles[index];
    const userId = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const email =
      role === "reviewer" && realReviewerEmail ? realReviewerEmail : `${role}@hollis.test`;
    const providerSubject =
      role === "reviewer" && realReviewerSubject ? realReviewerSubject : `e2e-${role}`;
    await client`
      insert into users (id, display_name, email, email_verified_at)
      values (${userId}, ${`E2E ${role}`}, ${email}, now())
    `;
    await client`
      insert into identity_accounts (email, email_verified_at, provider, provider_subject, user_id)
      values (${email}, now(), 'identity_platform', ${providerSubject}, ${userId})
    `;
    await client`
      insert into tenant_memberships (role, tenant_id, user_id)
      values (${role}, ${tenantOne}, ${userId})
    `;
  }
  const outsideUser = "00000000-0000-4000-8000-000000000201";
  await client`
    insert into users (id, display_name, email, email_verified_at)
    values (${outsideUser}, 'E2E Outside Owner', 'outside-owner@hollis.test', now())
  `;
  await client`
    insert into identity_accounts (email, email_verified_at, provider, provider_subject, user_id)
    values ('outside-owner@hollis.test', now(), 'identity_platform', 'e2e-outside-owner', ${outsideUser})
  `;
  await client`
    insert into tenant_memberships (role, tenant_id, user_id)
    values ('owner', ${tenantTwo}, ${outsideUser})
  `;
  await client`
    insert into policy_versions (
      created_by_user_id, document_digest, id, policy_id, tenant_id, title, version
    ) values (
      '00000000-0000-4000-8000-000000000001', ${`sha256:${"8".repeat(64)}`},
      '00000000-0000-4000-8000-000000000310', 'e2e-policy', ${tenantOne},
      'E2E Human Review Policy', '1.0'
    )
  `;
  await client`
    insert into policy_controls (
      attestation_criterion, control_id, control_version, evidence_requirement, id,
      interpretation, policy_version_id, tenant_id, title
    ) values (
      'A verified reference and a recorded human decision are required.',
      'human-review', '1.0', 'verified_reference_required',
      '00000000-0000-4000-8000-000000000311', 'deterministic',
      '00000000-0000-4000-8000-000000000310', ${tenantOne}, 'Human review'
    )
  `;
  await client`
    insert into review_cases (
      assigned_at, assigned_to_user_id, automated_system_version, created_at,
      decision_outcome, decision_rationale, decided_at, decided_by_user_id, evidence,
      external_reference, final_recommendation, hollis_case_reference, id,
      intake_fingerprint, policy_id, policy_version, recommendation, review_due_at,
      risk_level, rule_id, status, tenant_id, updated_at
    ) values (
      '2026-09-19T09:05:00.000Z', '00000000-0000-4000-8000-000000000003',
      'e2e-system-1', '2026-09-19T09:00:00.000Z', 'modified',
      'Synthetic E2E reviewer rationale.', '2026-09-19T09:10:00.000Z',
      '00000000-0000-4000-8000-000000000003',
      ${JSON.stringify([
        {
          digest: `sha256:${"a".repeat(64)}`,
          id: "e2e-evidence.json",
          mediaType: "application/json",
        },
      ])}::jsonb,
      'e2e-primary-case', 'refer', 'HL-26-TEST-0001',
      '00000000-0000-4000-8000-000000000399', ${`sha256:${"3".repeat(64)}`},
      'e2e-policy', '1.0', 'investigate', '2026-09-20T09:00:00.000Z',
      'high', 'human-review', 'completed', ${tenantOne}, '2026-09-19T09:10:00.000Z'
    )
  `;
  await client`
    insert into evidence_objects (
      case_id, digest, id, media_type, object_name, size_bytes, tenant_id, verified
    ) values (
      '00000000-0000-4000-8000-000000000399', ${`sha256:${"a".repeat(64)}`},
      '00000000-0000-4000-8000-000000000398', 'application/json',
      ${`tenants/${tenantOne}/evidence/${"a".repeat(64)}`}, 28, ${tenantOne}, true
    )
  `;
  await client`
    insert into review_events (
      actor_id, case_id, created_at, event_hash, event_type, payload, previous_hash, tenant_id
    ) values
      (
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000399', '2026-09-19T09:00:00.000Z',
        ${`sha256:${"4".repeat(64)}`}, 'case_created', '{}'::jsonb, null, ${tenantOne}
      ),
      (
        '00000000-0000-4000-8000-000000000003',
        '00000000-0000-4000-8000-000000000399', '2026-09-19T09:05:00.000Z',
        ${`sha256:${"5".repeat(64)}`}, 'review_started', '{}'::jsonb,
        ${`sha256:${"4".repeat(64)}`}, ${tenantOne}
      ),
      (
        '00000000-0000-4000-8000-000000000003',
        '00000000-0000-4000-8000-000000000399', '2026-09-19T09:10:00.000Z',
        ${`sha256:${"6".repeat(64)}`}, 'decision_recorded', '{}'::jsonb,
        ${`sha256:${"5".repeat(64)}`}, ${tenantOne}
      )
  `;
  await client`select set_config('app.tenant_id', ${tenantTwo}, false)`;
  await client`
    insert into review_cases (
      automated_system_version, evidence, external_reference, hollis_case_reference, id,
      intake_fingerprint, policy_id, policy_version, recommendation, review_due_at,
      risk_level, rule_id, status, tenant_id
    ) values (
      'e2e-system-1', '[]'::jsonb, 'isolation-case', 'HL-26-TEST-0002',
      '00000000-0000-4000-8000-000000000299', ${`sha256:${"2".repeat(64)}`},
      'e2e-policy', '1.0', 'refer', now() + interval '1 day', 'medium',
      'human-review', 'pending', ${tenantTwo}
    )
  `;
  await client`select set_config('app.tenant_id', ${tenantOne}, false)`;
  await client`
    insert into review_cases (
      automated_system_version, evidence, external_reference, hollis_case_reference, id,
      intake_fingerprint, policy_id, policy_version, recommendation, review_due_at,
      risk_level, rule_id, status, tenant_id
    ) values (
      'e2e-system-1', '[]'::jsonb, 'e2e-pending-case', 'HL-26-TEST-0003',
      '00000000-0000-4000-8000-000000000397', ${`sha256:${"7".repeat(64)}`},
      'e2e-policy', '1.0', 'investigate', now() + interval '2 days', 'medium',
      'human-review', 'pending', ${tenantOne}
    )
  `;
  await client`
    insert into review_events (
      actor_id, case_id, event_hash, event_type, payload, previous_hash, tenant_id
    ) values (
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000397', ${`sha256:${"8".repeat(64)}`},
      'case_created', '{}'::jsonb, null, ${tenantOne}
    )
  `;
  await client`
    insert into review_cases (
      automated_system_version, evidence, external_reference, hollis_case_reference, id,
      intake_fingerprint, policy_id, policy_version, recommendation, review_due_at,
      risk_level, rule_id, status, tenant_id
    ) values (
      'e2e-system-2',
      ${JSON.stringify([
        {
          digest: `sha256:${"b".repeat(64)}`,
          id: "canonical-workflow.json",
          mediaType: "application/json",
        },
      ])}::jsonb,
      'e2e-canonical-workflow', 'HL-26-TEST-0004',
      '00000000-0000-4000-8000-000000000396', ${`sha256:${"9".repeat(64)}`},
      'e2e-policy', '1.0', 'investigate', now() + interval '3 days', 'high',
      'human-review', 'pending', ${tenantOne}
    )
  `;
  await client`
    insert into evidence_objects (
      case_id, digest, id, media_type, object_name, size_bytes, tenant_id, verified
    ) values (
      '00000000-0000-4000-8000-000000000396', ${`sha256:${"b".repeat(64)}`},
      '00000000-0000-4000-8000-000000000395', 'application/json',
      ${`tenants/${tenantOne}/evidence/${"b".repeat(64)}`}, 31, ${tenantOne}, true
    )
  `;
  await client`
    insert into review_events (
      actor_id, case_id, event_hash, event_type, payload, previous_hash, tenant_id
    ) values (
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000396', ${`sha256:${"c".repeat(64)}`},
      'case_created', '{}'::jsonb, null, ${tenantOne}
    )
  `;
  await client`
    insert into review_cases (
      automated_system_version, evidence, external_reference, hollis_case_reference, id,
      intake_fingerprint, policy_id, policy_version, recommendation, review_due_at,
      risk_level, rule_id, status, tenant_id
    ) values (
      'e2e-system-2',
      ${JSON.stringify([
        {
          digest: `sha256:${"c".repeat(64)}`,
          id: "canonical-mobile-workflow.json",
          mediaType: "application/json",
        },
      ])}::jsonb,
      'e2e-canonical-mobile-workflow', 'HL-26-TEST-0005',
      '00000000-0000-4000-8000-000000000393', ${`sha256:${"d".repeat(64)}`},
      'e2e-policy', '1.0', 'investigate', now() + interval '3 days', 'high',
      'human-review', 'pending', ${tenantOne}
    )
  `;
  await client`
    insert into evidence_objects (
      case_id, digest, id, media_type, object_name, size_bytes, tenant_id, verified
    ) values (
      '00000000-0000-4000-8000-000000000393', ${`sha256:${"c".repeat(64)}`},
      '00000000-0000-4000-8000-000000000392', 'application/json',
      ${`tenants/${tenantOne}/evidence/${"c".repeat(64)}`}, 31, ${tenantOne}, true
    )
  `;
  await client`
    insert into review_events (
      actor_id, case_id, event_hash, event_type, payload, previous_hash, tenant_id
    ) values (
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000393', ${`sha256:${"d".repeat(64)}`},
      'case_created', '{}'::jsonb, null, ${tenantOne}
    )
  `;
  const legacyCommitment = `sha256:${"d".repeat(64)}`;
  await client`
    insert into public_attestation_case_files (
      case_commitment, case_file, case_id, public_id, tenant_id
    ) values (
      ${legacyCommitment},
      ${JSON.stringify({
        auditManifestHash: legacyCommitment,
        caseCommitment: legacyCommitment,
        evidence: [
          {
            digest: `sha256:${"a".repeat(64)}`,
            mediaType: "application/json",
            verified: true,
          },
        ],
        policy: {
          control: {
            attestationCriterion:
              "A verified reference and a recorded human decision are required.",
            controlId: "human-review",
            controlVersion: "1.0",
            evidenceRequirement: "verified_reference_required",
            interpretation: "deterministic",
            policyDocumentDigest: `sha256:${"8".repeat(64)}`,
          },
          policyId: "e2e-policy",
          policyVersion: "1.0",
        },
        review: {
          decisionRecorded: true,
          escalationRecorded: false,
          humanDecisionOutcome: "modified",
          reviewerActionCommitment: `sha256:${"e".repeat(64)}`,
        },
        schemaVersion: "hollis.adjudication-case.v1",
      })}::jsonb,
      '00000000-0000-4000-8000-000000000399',
      '00000000-0000-4000-8000-000000000394', ${tenantOne}
    )
  `;
} finally {
  await client.end();
}
