import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import type { AccessTokenVerifier, AuthenticatedPrincipal } from "./auth.js";
import type { ReviewIntakeRecord, ReviewIntakeStore, TenantResolver } from "./review-intake.js";
import type { EvidenceMetadataStore } from "./evidence.js";
import type { AttestationProvider, AttestationStore } from "./attestation.js";
import type { ReviewCaseDetail, ReviewQueueItem, ReviewWorkflowStore } from "./workflow.js";
import type { ReviewExport } from "@hollis/contracts";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const environment = {
  API_HOST: "127.0.0.1",
  API_PORT: 4000,
  GCS_PROJECT_ID: "hollis-507001",
  DATABASE_URL: "postgres://hollis_app:hollis_app@localhost:5434/hollis",
  NODE_ENV: "test" as const,
  WEB_ORIGIN: "http://localhost:3000",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_ISSUER: "https://api.workos.com",
  WORKOS_JWKS_URL: "https://api.workos.com/sso/jwks/client_test",
};

const tenantId = "0198ef37-6216-7000-8000-000000000001";

function createPrincipal(permissions: string[] = ["reviews:read"]): AuthenticatedPrincipal {
  return {
    organizationId: "org_01",
    permissions,
    role: "reviewer",
    sessionId: "session_01",
    userId: "user_01",
  };
}

function createDependencies(
  options: {
    permissions?: string[];
    provisioned?: boolean;
    store?: ReviewIntakeStore;
    workflowStore?: ReviewWorkflowStore;
    legalHoldStore?: (
      tenantId: string,
      caseId: string,
      evidenceId: string,
      active: boolean,
      actorId: string,
    ) => Promise<boolean>;
    attestationProvider?: AttestationProvider;
    attestationStore?: AttestationStore;
    evidenceMetadataStore?: EvidenceMetadataStore;
  } = {},
) {
  const accessTokenVerifier: AccessTokenVerifier = {
    async verify(token) {
      expect(token).toBe("verified-token");
      return createPrincipal(options.permissions);
    },
  };
  const tenantResolver: TenantResolver = {
    async findByOrganizationId(organizationId) {
      expect(organizationId).toBe("org_01");
      return options.provisioned === false ? null : { id: tenantId, organizationId };
    },
  };
  const reviewIntakeStore: ReviewIntakeStore =
    options.store ??
    ({
      async create() {
        throw new Error("Review intake was not expected.");
      },
    } satisfies ReviewIntakeStore);
  const workflowStore: ReviewWorkflowStore =
    options.workflowStore ??
    ({
      async exportCase() {
        throw new Error("Workflow export was not expected.");
      },
      async claim() {
        throw new Error("Workflow claim was not expected.");
      },
      async decide() {
        throw new Error("Workflow decision was not expected.");
      },
      async escalate() {
        throw new Error("Workflow escalation was not expected.");
      },
      async get() {
        throw new Error("Workflow detail was not expected.");
      },
      async list() {
        throw new Error("Workflow queue was not expected.");
      },
    } satisfies ReviewWorkflowStore);
  const evidenceMetadataStore: EvidenceMetadataStore =
    options.evidenceMetadataStore ??
    ({
      async create() {
        throw new Error("Evidence metadata was not expected.");
      },
      async markVerified() {
        throw new Error("Evidence verification was not expected.");
      },
      async get() {
        throw new Error("Evidence metadata was not expected.");
      },
      async list() {
        throw new Error("Evidence metadata was not expected.");
      },
    } satisfies EvidenceMetadataStore);

  return {
    accessTokenVerifier,
    attestationProvider: options.attestationProvider,
    attestationStore: options.attestationStore,
    evidenceMetadataStore,
    legalHoldStore: options.legalHoldStore,
    reviewIntakeStore,
    tenantResolver,
    workflowStore,
  };
}

const completedExport: ReviewExport = {
  case: {
    assignedToUserId: "user_01",
    automatedSystemVersion: "claims-model-2026-08",
    createdAt: "2026-08-28T08:00:00.000Z",
    decisionOutcome: "rejected",
    evidence: [
      {
        digest: `sha256:${"a".repeat(64)}`,
        id: "evidence-001",
        mediaType: "application/pdf",
      },
    ],
    externalReference: "claim-001",
    finalRecommendation: "deny",
    id: "0198ef37-6216-7000-8000-000000000002",
    policyVersion: "commercial-property-2026-01",
    recommendation: "deny",
    reviewDueAt: "2026-08-29T08:00:00.000Z",
    riskLevel: "high",
    ruleId: "human-review-adverse-action",
    status: "completed",
  },
  events: [
    {
      actorId: "user_01",
      createdAt: "2026-08-28T08:10:00.000Z",
      eventHash: `sha256:${"b".repeat(64)}`,
      eventSequence: 1,
      eventType: "decision_recorded",
      payload: {},
      previousHash: null,
    },
  ],
  manifestHash: `sha256:${"c".repeat(64)}`,
  schemaVersion: "hollis.review-export.v1",
};

const validIntake = {
  automatedSystemVersion: "claims-model-2026-08",
  evidence: [
    {
      digest: `sha256:${"a".repeat(64)}`,
      id: "evidence-001",
      mediaType: "application/pdf",
    },
  ],
  externalReference: "claim-001",
  policyVersion: "commercial-property-2026-01",
  recommendation: "deny",
  riskLevel: "high",
  reviewDueAt: "2026-08-29T08:00:00.000Z",
  ruleId: "human-review-adverse-action",
};

describe("API boundaries", () => {
  it("reports that the process is live", async () => {
    const app = await buildApp(environment, createDependencies());
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("rejects a protected request without a bearer token", async () => {
    const app = await buildApp(environment, createDependencies());
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/v1/session" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      code: "unauthorized",
      message: "Authentication required.",
    });
  });

  it("returns identity and the server-resolved tenant", async () => {
    const app = await buildApp(environment, createDependencies());
    apps.push(app);

    const response = await app.inject({
      headers: { authorization: "Bearer verified-token" },
      method: "GET",
      url: "/v1/session",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      organizationId: "org_01",
      permissions: ["reviews:read"],
      role: "reviewer",
      tenantId,
      userId: "user_01",
    });
  });

  it("rejects an organization that is not provisioned", async () => {
    const app = await buildApp(environment, createDependencies({ provisioned: false }));
    apps.push(app);

    const response = await app.inject({
      headers: { authorization: "Bearer verified-token" },
      method: "GET",
      url: "/v1/session",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      code: "organization_not_provisioned",
      message: "The active organization does not have Hollis access.",
    });
  });

  it("rejects review intake without the required permission", async () => {
    const app = await buildApp(environment, createDependencies());
    apps.push(app);

    const response = await app.inject({
      headers: { authorization: "Bearer verified-token" },
      method: "POST",
      payload: validIntake,
      url: "/v1/review-cases",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ code: "forbidden", message: "Permission denied." });
  });

  it("rejects caller-controlled tenant identity", async () => {
    const app = await buildApp(
      environment,
      createDependencies({ permissions: ["reviews:create"] }),
    );
    apps.push(app);

    const response = await app.inject({
      headers: { authorization: "Bearer verified-token" },
      method: "POST",
      payload: { ...validIntake, tenantId: "0198ef37-6216-7000-8000-000000000099" },
      url: "/v1/review-cases",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: "invalid_request",
      message: "Request validation failed.",
    });
  });

  it("creates a pending review under the resolved tenant", async () => {
    let received: ReviewIntakeRecord | undefined;
    const store: ReviewIntakeStore = {
      async create(record) {
        received = record;
        return {
          created: true,
          reviewCase: {
            createdAt: record.occurredAt,
            externalReference: record.externalReference,
            fingerprint: record.fingerprint,
            id: record.caseId,
            reviewDueAt: new Date(record.reviewDueAt),
            status: "pending",
          },
        };
      },
    };
    const app = await buildApp(
      environment,
      createDependencies({ permissions: ["reviews:create"], store }),
    );
    apps.push(app);

    const response = await app.inject({
      headers: { authorization: "Bearer verified-token" },
      method: "POST",
      payload: validIntake,
      url: "/v1/review-cases",
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      externalReference: "claim-001",
      replayed: false,
      status: "pending",
    });
    expect(received).toMatchObject({
      actorId: "user_01",
      recommendation: "deny",
      tenantId,
    });
  });

  it("lists the tenant queue only with read permission", async () => {
    const queueItem: ReviewQueueItem = {
      assignedToUserId: null,
      createdAt: new Date("2026-08-28T08:00:00.000Z"),
      externalReference: "claim-001",
      id: "0198ef37-6216-7000-8000-000000000002",
      recommendation: "deny",
      reviewDueAt: new Date("2026-08-29T08:00:00.000Z"),
      riskLevel: "high",
      status: "pending",
    };
    const workflowStore: ReviewWorkflowStore = {
      async exportCase() {
        throw new Error("Not expected.");
      },
      async claim() {
        throw new Error("Not expected.");
      },
      async decide() {
        throw new Error("Not expected.");
      },
      async escalate() {
        throw new Error("Not expected.");
      },
      async get() {
        throw new Error("Not expected.");
      },
      async list(resolvedTenantId, status) {
        expect(resolvedTenantId).toBe(tenantId);
        expect(status).toBeUndefined();
        return [queueItem];
      },
    };
    const app = await buildApp(
      environment,
      createDependencies({ permissions: ["reviews:read"], workflowStore }),
    );
    apps.push(app);

    const response = await app.inject({
      headers: { authorization: "Bearer verified-token" },
      method: "GET",
      url: "/v1/review-cases",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        assignedToUserId: null,
        createdAt: "2026-08-28T08:00:00.000Z",
        externalReference: "claim-001",
        id: "0198ef37-6216-7000-8000-000000000002",
        recommendation: "deny",
        reviewDueAt: "2026-08-29T08:00:00.000Z",
        riskLevel: "high",
        status: "pending",
      },
    ]);
  });

  it("submits a completed review as a GenLayer attestation and persists its receipt", async () => {
    let providerInput: unknown;
    let storedCaseId: string | undefined;
    const workflowStore: ReviewWorkflowStore = {
      async exportCase() {
        return completedExport;
      },
      async claim() {
        throw new Error("Not expected.");
      },
      async decide() {
        throw new Error("Not expected.");
      },
      async escalate() {
        throw new Error("Not expected.");
      },
      async get() {
        throw new Error("Not expected.");
      },
      async list() {
        throw new Error("Not expected.");
      },
    };
    const attestationProvider: AttestationProvider = {
      async get() {
        throw new Error("Not expected.");
      },
      async submit(input) {
        providerInput = input;
        return {
          contractAddress: "0x1234567890123456789012345678901234567890",
          provider: "genlayer",
          providerSubmissionId: "submission-001",
          status: "submitted",
          transactionHash: null,
          verdict: null,
        };
      },
    };
    const attestationStore: AttestationStore = {
      async create(_tenantId, caseId, _actorId, caseFile, publicCaseFileUrl, receipt) {
        storedCaseId = caseId;
        return {
          ...receipt,
          caseCommitment: caseFile.caseCommitment,
          createdAt: "2026-08-28T08:11:00.000Z",
          id: "0198ef37-6216-7000-8000-000000000003",
          publicCaseFileUrl,
          updatedAt: "2026-08-28T08:11:00.000Z",
        };
      },
      async list() {
        return [];
      },
      async update() {
        throw new Error("Not expected.");
      },
    };
    const evidenceMetadataStore: EvidenceMetadataStore = {
      async create() {
        throw new Error("Not expected.");
      },
      async get() {
        throw new Error("Not expected.");
      },
      async list() {
        return [
          { digest: `sha256:${"a".repeat(64)}`, mediaType: "application/pdf", verified: true },
        ];
      },
      async markVerified() {
        throw new Error("Not expected.");
      },
    };
    const app = await buildApp(
      environment,
      createDependencies({
        attestationProvider,
        attestationStore,
        evidenceMetadataStore,
        permissions: ["reviews:attest"],
        workflowStore,
      }),
    );
    apps.push(app);

    const response = await app.inject({
      headers: { authorization: "Bearer verified-token" },
      method: "POST",
      payload: {
        policy: {
          control: {
            attestationCriterion: "A completed human adverse-action review must be recorded.",
            controlId: "human-review-adverse-action",
            controlVersion: "2026-01",
            evidenceRequirement: "verified_reference_required",
            interpretation: "deterministic",
            policyDocumentDigest: `sha256:${"d".repeat(64)}`,
          },
          policyId: "commercial-property-governance",
          policyVersion: "commercial-property-2026-01",
        },
        publicCaseFileUrl: "https://example.test/cases/claim-001.json",
      },
      url: `/v1/review-cases/${completedExport.case.id}/attestations`,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      provider: "genlayer",
      providerSubmissionId: "submission-001",
      status: "submitted",
    });
    expect(storedCaseId).toBe(completedExport.case.id);
    expect(providerInput).toMatchObject({
      caseFile: {
        caseCommitment: completedExport.manifestHash,
        policy: { control: { controlId: "human-review-adverse-action" } },
        review: { decisionRecorded: true, humanDecisionOutcome: "rejected" },
      },
    });
  });

  it("allows a reviewer with assign permission to claim a case for themselves", async () => {
    const claimedCase = {
      assignedAt: new Date("2026-08-28T08:01:00.000Z"),
      assignedToUserId: "user_01",
      createdAt: new Date("2026-08-28T08:00:00.000Z"),
      externalReference: "claim-001",
      id: "0198ef37-6216-7000-8000-000000000002",
      recommendation: "deny",
      reviewDueAt: new Date("2026-08-29T08:00:00.000Z"),
      riskLevel: "high",
      status: "in_review",
    } as ReviewCaseDetail;
    const workflowStore: ReviewWorkflowStore = {
      async exportCase() {
        throw new Error("Not expected.");
      },
      async claim(resolvedTenantId, actorId, caseId) {
        expect(resolvedTenantId).toBe(tenantId);
        expect(actorId).toBe("user_01");
        expect(caseId).toBe(claimedCase.id);
        return { case: claimedCase, replayed: false };
      },
      async decide() {
        throw new Error("Not expected.");
      },
      async escalate() {
        throw new Error("Not expected.");
      },
      async get() {
        throw new Error("Not expected.");
      },
      async list() {
        throw new Error("Not expected.");
      },
    };
    const app = await buildApp(
      environment,
      createDependencies({ permissions: ["reviews:assign"], workflowStore }),
    );
    apps.push(app);

    const response = await app.inject({
      headers: { authorization: "Bearer verified-token" },
      method: "POST",
      url: `/v1/review-cases/${claimedCase.id}/claim`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      assignedToUserId: "user_01",
      replayed: false,
      status: "in_review",
    });
  });
});
