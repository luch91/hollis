import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_TEST_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_TEST_URL is required for database integration tests.");
}

const owner = postgres(databaseUrl, { max: 1 });
const tenantOneId = randomUUID();
const tenantTwoId = randomUUID();
const caseId = randomUUID();
const publicCaseFileId = randomUUID();
const organizationOneId = `org_${randomUUID()}`;
const organizationTwoId = `org_${randomUUID()}`;
const identityPlatformSubject = `identity_${randomUUID()}`;
const memberActorId = randomUUID();
const assignedMemberId = randomUUID();
const assignedMemberLegacyId = `user_${randomUUID()}`;
const outsideMemberId = randomUUID();
let provisionedTenantId: string | undefined;
let provisionedUserId: string | undefined;
const evidence = [
  { digest: `sha256:${"a".repeat(64)}`, id: "isolation", mediaType: "application/json" },
];

beforeAll(async () => {
  await owner`
    insert into tenants (id, name, workos_organization_id)
    values
      (${tenantOneId}, 'Isolation tenant one', ${organizationOneId}),
      (${tenantTwoId}, 'Isolation tenant two', ${organizationTwoId})
  `;
  await owner`
    insert into users (id, display_name, email, workos_user_id)
    values
      (${memberActorId}, 'Review lead', 'review.lead@example.test', null),
      (${assignedMemberId}, 'Jordan Blake', 'jordan.blake@example.test', ${assignedMemberLegacyId}),
      (${outsideMemberId}, 'Outside reviewer', 'outside.reviewer@example.test', null)
  `;
  await owner`
    insert into tenant_memberships (role, tenant_id, user_id)
    values
      ('administrator', ${tenantOneId}, ${memberActorId}),
      ('reviewer', ${tenantOneId}, ${assignedMemberId}),
      ('reviewer', ${tenantTwoId}, ${outsideMemberId})
  `;
});

afterAll(async () => {
  await owner`delete from public_attestation_case_files where public_id = ${publicCaseFileId}`;
  await owner`delete from review_cases where id = ${caseId}`;
  if (provisionedTenantId) {
    await owner`delete from tenant_memberships where tenant_id = ${provisionedTenantId}`;
    await owner`delete from tenants where id = ${provisionedTenantId}`;
  }
  if (provisionedUserId) {
    await owner`delete from identity_accounts where user_id = ${provisionedUserId}`;
    await owner`delete from users where id = ${provisionedUserId}`;
  }
  await owner`
    delete from workspace_audit_events
    where tenant_id in (${tenantOneId}, ${tenantTwoId})
  `;
  await owner`
    delete from tenant_memberships
    where user_id in (${memberActorId}, ${assignedMemberId}, ${outsideMemberId})
  `;
  await owner`
    delete from users
    where id in (${memberActorId}, ${assignedMemberId}, ${outsideMemberId})
  `;
  await owner`delete from tenants where id in (${tenantOneId}, ${tenantTwoId})`;
  await owner.end();
});

describe("PostgreSQL tenant isolation", () => {
  it("hides tenants until a tenant context is set", async () => {
    await owner.begin(async (transaction) => {
      await transaction.unsafe("set local role hollis_app");
      const withoutContext = await transaction`
        select count(*)::integer as count from tenants where id = ${tenantOneId}
      `;

      expect(withoutContext[0]?.count).toBe(0);

      await transaction`select set_config('app.tenant_id', ${tenantOneId}, true)`;
      const withContext = await transaction`
        select count(*)::integer as count from tenants where id = ${tenantOneId}
      `;

      expect(withContext[0]?.count).toBe(1);
    });
  });

  it("hides another tenant's review cases", async () => {
    await owner.begin(async (transaction) => {
      await transaction.unsafe("set local role hollis_app");
      await transaction`select set_config('app.tenant_id', ${tenantOneId}, true)`;
      await transaction`
        insert into review_cases (
          automated_system_version,
          evidence,
          external_reference,
          id,
          intake_fingerprint,
          policy_version,
          recommendation,
          risk_level,
          rule_id,
          tenant_id
        ) values (
          'model-1',
          ${JSON.stringify(evidence)}::jsonb,
          'isolation-claim',
          ${caseId},
          'sha256:isolation',
          'policy-1',
          'deny',
          'high',
          'rule-1',
          ${tenantOneId}
        )
      `;
    });

    await owner.begin(async (transaction) => {
      await transaction.unsafe("set local role hollis_app");
      await transaction`select set_config('app.tenant_id', ${tenantTwoId}, true)`;
      const rows = await transaction`
        select id from review_cases where id = ${caseId}
      `;

      expect(rows).toHaveLength(0);
    });
  });

  it("blocks a cross-tenant insert", async () => {
    await expect(
      owner.begin(async (transaction) => {
        await transaction.unsafe("set local role hollis_app");
        await transaction`select set_config('app.tenant_id', ${tenantTwoId}, true)`;
        await transaction`
          insert into review_cases (
            automated_system_version,
            external_reference,
            intake_fingerprint,
            policy_version,
            recommendation,
            risk_level,
            rule_id,
            tenant_id
          ) values (
            'model-1',
            'cross-tenant-attempt',
            'sha256:isolation',
            'policy-1',
            'deny',
            'high',
            'rule-1',
            ${tenantOneId}
          )
        `;
      }),
    ).rejects.toThrow(/row-level security policy/);
  });

  it("allows public retrieval only for the exact published case-file identifier", async () => {
    await owner.begin(async (transaction) => {
      await transaction.unsafe("set local role hollis_app");
      await transaction`select set_config('app.tenant_id', ${tenantOneId}, true)`;
      await transaction`
        insert into public_attestation_case_files (
          case_commitment,
          case_file,
          case_id,
          public_id,
          tenant_id
        ) values (
          'sha256:public-case-file',
          ${JSON.stringify({ schemaVersion: "test" })}::jsonb,
          ${caseId},
          ${publicCaseFileId},
          ${tenantOneId}
        )
      `;
    });

    await owner.begin(async (transaction) => {
      await transaction.unsafe("set local role hollis_app");
      const withoutIdentifier = await transaction`
        select count(*)::integer as count from public_attestation_case_files
      `;
      expect(withoutIdentifier[0]?.count).toBe(0);

      await transaction`
        select set_config('app.public_attestation_case_file_id', ${publicCaseFileId}, true)
      `;
      const withIdentifier = await transaction`
        select count(*)::integer as count from public_attestation_case_files
      `;
      expect(withIdentifier[0]?.count).toBe(1);
    });
  });

  it("prevents the runtime role from altering review history", async () => {
    const [privileges] = await owner`
      select
        has_table_privilege('hollis_app', 'review_events', 'UPDATE') as can_update_events,
        has_table_privilege('hollis_app', 'review_events', 'DELETE') as can_delete_events,
        has_table_privilege('hollis_app', 'review_cases', 'DELETE') as can_delete_cases,
        has_table_privilege('hollis_app', 'public_attestation_case_files', 'UPDATE') as can_update_public_case_files,
        has_table_privilege('hollis_app', 'public_attestation_case_files', 'DELETE') as can_delete_public_case_files
    `;

    expect(privileges).toEqual({
      can_delete_cases: false,
      can_delete_events: false,
      can_delete_public_case_files: false,
      can_update_events: false,
      can_update_public_case_files: false,
    });
  });

  it("resolves only an assigned member from the authorized workspace", async () => {
    await owner.begin(async (transaction) => {
      await transaction.unsafe("set local role hollis_app");
      const resolved = await transaction`
        select *
        from get_hollis_workspace_member_identity(
          ${tenantOneId}::uuid,
          ${memberActorId}::uuid,
          ${assignedMemberId}
        )
      `;
      const outside = await transaction`
        select *
        from get_hollis_workspace_member_identity(
          ${tenantOneId}::uuid,
          ${memberActorId}::uuid,
          ${outsideMemberId}
        )
      `;

      expect(resolved).toEqual([
        {
          avatarUrl: null,
          displayName: "Jordan Blake",
          email: "jordan.blake@example.test",
          role: "reviewer",
          userId: assignedMemberId,
        },
      ]);
      expect(outside).toHaveLength(0);
    });
  });

  it("resolves a legacy reviewer subject within the authorized workspace", async () => {
    await owner.begin(async (transaction) => {
      await transaction.unsafe("set local role hollis_app");
      const resolved = await transaction`
        select *
        from get_hollis_workspace_member_identity(
          ${tenantOneId}::uuid,
          ${memberActorId}::uuid,
          ${assignedMemberLegacyId}
        )
      `;

      expect(resolved).toEqual([
        {
          avatarUrl: null,
          displayName: "Jordan Blake",
          email: "jordan.blake@example.test",
          role: "reviewer",
          userId: assignedMemberId,
        },
      ]);
    });
  });

  it("redacts directory contact data for read-only workspace members", async () => {
    await owner.begin(async (transaction) => {
      await transaction.unsafe("set local role hollis_app");
      const directory = await transaction`
        select *
        from list_hollis_workspace_members(${tenantOneId}::uuid, ${assignedMemberId}::uuid)
      `;
      const currentMember = directory.find((member) => member.userId === assignedMemberId);
      const otherMember = directory.find((member) => member.userId === memberActorId);

      expect(currentMember).toMatchObject({
        displayName: "Jordan Blake",
        email: "jordan.blake@example.test",
        role: "reviewer",
      });
      expect(otherMember).toMatchObject({
        avatarUrl: null,
        displayName: "Review lead",
        email: null,
        role: "administrator",
      });
    });
  });

  it("updates a workspace profile through the guarded runtime function", async () => {
    await owner.begin(async (transaction) => {
      await transaction.unsafe("set local role hollis_app");
      const updated = await transaction`
        select *
        from update_hollis_workspace_profile(
          ${tenantOneId}::uuid,
          ${memberActorId}::uuid,
          'Isolation tenant one updated',
          'technology',
          'europe',
          'https://isolation.example.test'
        )
      `;

      expect(updated).toEqual([
        {
          id: tenantOneId,
          industry: "technology",
          name: "Isolation tenant one updated",
          operatingRegion: "europe",
          website: "https://isolation.example.test",
        },
      ]);
    });

    const [persisted] = await owner`
      select industry, name, operating_region as "operatingRegion", website
      from tenants
      where id = ${tenantOneId}
    `;
    expect(persisted).toEqual({
      industry: "technology",
      name: "Isolation tenant one updated",
      operatingRegion: "europe",
      website: "https://isolation.example.test",
    });
  });

  it("rejects member identity lookup by an actor outside the workspace", async () => {
    await expect(
      owner.begin(async (transaction) => {
        await transaction.unsafe("set local role hollis_app");
        await transaction`
          select *
          from get_hollis_workspace_member_identity(
            ${tenantOneId}::uuid,
            ${outsideMemberId}::uuid,
            ${assignedMemberId}
          )
        `;
      }),
    ).rejects.toThrow(/Workspace membership required/);
  });

  it("allows the runtime role to provision only through the dedicated public function", async () => {
    await owner.begin(async (transaction) => {
      await transaction.unsafe("set local role hollis_app");
      const [identity] = await transaction`
        select *
        from resolve_identity_platform_user(
          ${identityPlatformSubject},
          'provisioned-owner@example.test',
          true,
          'Provisioned owner',
          ''
        )
      `;
      provisionedUserId = identity?.userId;
      const [provisioned] = await transaction`
        select *
        from provision_public_hollis_workspace(
          'Provisioned tenant',
          ${provisionedUserId}::uuid
        )
      `;

      provisionedTenantId = provisioned?.tenantId;
      expect(provisioned?.workspaceName).toBe("Provisioned tenant");
      expect(provisioned?.role).toBe("owner");
      expect(provisioned?.tenantId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    const [membership] = await owner`
      select role
      from tenant_memberships
      where tenant_id = ${provisionedTenantId}
        and user_id = ${provisionedUserId}
    `;
    expect(membership).toEqual({ role: "owner" });
  });
});
