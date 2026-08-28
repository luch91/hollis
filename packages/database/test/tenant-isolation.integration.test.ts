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
const organizationOneId = `org_${randomUUID()}`;
const organizationTwoId = `org_${randomUUID()}`;

beforeAll(async () => {
  await owner`
    insert into tenants (id, name, workos_organization_id)
    values
      (${tenantOneId}, 'Isolation tenant one', ${organizationOneId}),
      (${tenantTwoId}, 'Isolation tenant two', ${organizationTwoId})
  `;
});

afterAll(async () => {
  await owner`delete from review_cases where id = ${caseId}`;
  await owner`delete from tenants where id in (${tenantOneId}, ${tenantTwoId})`;
  await owner.end();
});

describe("PostgreSQL tenant isolation", () => {
  it("hides tenants until an organization context is set", async () => {
    await owner.begin(async (transaction) => {
      await transaction.unsafe("set local role hollis_app");
      const withoutContext = await transaction`
        select count(*)::integer as count from tenants where id = ${tenantOneId}
      `;

      expect(withoutContext[0]?.count).toBe(0);

      await transaction`select set_config('app.workos_organization_id', ${organizationOneId}, true)`;
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

  it("prevents the runtime role from altering review history", async () => {
    const [privileges] = await owner`
      select
        has_table_privilege('hollis_app', 'review_events', 'UPDATE') as can_update_events,
        has_table_privilege('hollis_app', 'review_events', 'DELETE') as can_delete_events,
        has_table_privilege('hollis_app', 'review_cases', 'DELETE') as can_delete_cases
    `;

    expect(privileges).toEqual({
      can_delete_cases: false,
      can_delete_events: false,
      can_update_events: false,
    });
  });
});
