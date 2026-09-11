import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { buildAdjudicationCaseFile } from "./attestation-workflow.js";
import type {
  AccessTokenVerifier,
  ApplicationSessionStore,
  AuthenticatedPrincipal,
  UnscopedAccessTokenVerifier,
} from "./auth.js";
import type { ReviewIntakeRecord, ReviewIntakeStore, TenantResolver } from "./review-intake.js";
import type { EvidenceMetadataStore } from "./evidence.js";
import type {
  AttestationProvider,
  AttestationStore,
  FinalizedAttestationImporter,
  PublicAttestationCaseFileStore,
} from "./attestation.js";
import type { ReviewCaseDetail, ReviewQueueItem, ReviewWorkflowStore } from "./workflow.js";
import type { ReviewExport } from "@hollis/contracts";
import type { WorkspaceProvisioner } from "./workspace-provisioning.js";
import type { PolicyLibraryStore } from "./policy-library.js";
import type { createPostgresWorkspaceControlsStore } from "./persistence.js";
import type { IdentityPlatformTokenVerifier } from "./identity-platform.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const environment = {
  API_HOST: "127.0.0.1",
  API_PORT: 4000,
  GCS_PROJECT_ID: "hollis-507001",
  PUBLIC_ATTESTATION_ORIGIN: "https://api.hollis.test",
  DATABASE_URL: "postgres://hollis_app:hollis_app@localhost:5434/hollis",
  NODE_ENV: "test" as const,
  WEB_ORIGIN: "http://localhost:3000",
  HOLLIS_SESSION_TTL_HOURS: 8,
  IDENTITY_PLATFORM_PROJECT_ID: "hollis-507001",
};

const tenantId = "0198ef37-6216-7000-8000-000000000001";

function createPrincipal(permissions: string[] = ["reviews:read"]): AuthenticatedPrincipal {
  return {
    permissions,
    role: "reviewer",
    sessionId: "session_01",
    tenantId,
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
    finalizedAttestationImporter?: FinalizedAttestationImporter;
    publicAttestationCaseFileStore?: PublicAttestationCaseFileStore;
    attestationStore?: AttestationStore;
    evidenceMetadataStore?: EvidenceMetadataStore;
    workspaceProvisioner?: WorkspaceProvisioner;
    policyLibraryStore?: PolicyLibraryStore;
    identityPlatformTokenVerifier?: IdentityPlatformTokenVerifier;
    unscopedTenantId?: string | null;
    workspaceControlsStore?: ReturnType<typeof createPostgresWorkspaceControlsStore>;
  } = {},
) {
  const accessTokenVerifier: AccessTokenVerifier = {
    async verify(token) {
      expect(token).toBe("verified-token");
      return createPrincipal(options.permissions);
    },
  };
  const tenantResolver: TenantResolver = {
    async findByTenantId(receivedTenantId) {
      expect(receivedTenantId).toBe(tenantId);
      return options.provisioned === false ? null : { id: tenantId };
    },
  };
  const unscopedAccessTokenVerifier: UnscopedAccessTokenVerifier = {
    async verify(token) {
      expect(token).toBe("unscoped-token");
      return {
        activeWorkspace: options.unscopedTenantId
          ? { id: options.unscopedTenantId, name: "Northstar Claims", role: "owner" }
          : null,
        sessionId: "session_01",
        userId: "user_01",
      };
    },
  };
  const identityPlatformTokenVerifier: IdentityPlatformTokenVerifier =
    options.identityPlatformTokenVerifier ??
    ({
      async verify() {
        return {
          avatarUrl: null,
          displayName: "Test user",
          email: "test.user@example.test",
          subject: "identity-test-user",
        };
      },
    } satisfies IdentityPlatformTokenVerifier);
  const reviewIntakeStore: ReviewIntakeStore =
    options.store ??
    ({
      async create() {
        throw new Error("Review intake was not expected.");
      },
    } satisfies ReviewIntakeStore);
  const applicationSessionStore: ApplicationSessionStore = {
    async activate() {
      return {
        role: "owner",
        sessionId: "session_01",
        tenantId,
        userId: "user_01",
        workspaceName: "Northstar Claims",
      };
    },
    async establish() {
      return {
        role: null,
        sessionId: "session_01",
        tenantId: null,
        userId: "user_01",
        workspaceName: null,
      };
    },
    async read() {
      return {
        role: "reviewer",
        sessionId: "session_01",
        tenantId,
        userId: "user_01",
        workspaceName: "Northstar Claims",
      };
    },
    async revoke() {
      return true;
    },
  };
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
  const publicAttestationCaseFileStore: PublicAttestationCaseFileStore =
    options.publicAttestationCaseFileStore ??
    ({
      async create() {
        throw new Error("Public attestation case-file storage was not expected.");
      },
      async findForCase() {
        throw new Error("Public attestation case-file storage was not expected.");
      },
      async findPublic() {
        throw new Error("Public attestation case-file storage was not expected.");
      },
      async list() {
        throw new Error("Public attestation case-file storage was not expected.");
      },
    } satisfies PublicAttestationCaseFileStore);
  const workspaceProvisioner: WorkspaceProvisioner =
    options.workspaceProvisioner ??
    ({
      async create() {
        throw new Error("Workspace provisioning was not expected.");
      },
    } satisfies WorkspaceProvisioner);
  const policyLibraryStore: PolicyLibraryStore =
    options.policyLibraryStore ??
    ({
      async create() {
        throw new Error("Policy creation was not expected.");
      },
      async findControl(_tenantId, policyVersion, controlId) {
        return {
          controls: [
            {
              attestationCriterion: "Human review must be recorded.",
              controlId,
              controlVersion: "1",
              evidenceRequirement: "verified_reference_required",
              interpretation: "deterministic",
              title: "Human review",
            },
          ],
          createdAt: "2026-08-28T08:00:00.000Z",
          createdByUserId: "00000000-0000-4000-8000-000000000001",
          documentDigest: `sha256:${"a".repeat(64)}`,
          id: "00000000-0000-4000-8000-000000000002",
          policyId: "test-policy",
          publishedAt: "2026-08-28T08:00:00.000Z",
          title: "Test policy",
          version: policyVersion,
        };
      },
      async list() {
        return [];
      },
    } satisfies PolicyLibraryStore);

  return {
    accessTokenVerifier,
    applicationSessionStore,
    attestationProvider: options.attestationProvider,
    attestationStore: options.attestationStore,
    evidenceMetadataStore,
    finalizedAttestationImporter: options.finalizedAttestationImporter,
    identityPlatformTokenVerifier,
    publicAttestationCaseFileStore,
    policyLibraryStore,
    legalHoldStore: options.legalHoldStore,
    reviewIntakeStore,
    tenantResolver,
    unscopedAccessTokenVerifier,
    workspaceProvisioner,
    workspaceControlsStore: options.workspaceControlsStore,
    workflowStore,
  };
}

const completedExport: ReviewExport = {
  case: {
    assignedAt: "2026-08-28T08:05:00.000Z",
    assignedToUserId: "user_01",
    automatedSystemVersion: "claims-model-2026-08",
    createdAt: "2026-08-28T08:00:00.000Z",
    decisionOutcome: "rejected",
    decisionRationale: "The required human review rejected the recommendation.",
    decidedAt: "2026-08-28T08:10:00.000Z",
    decidedByUserId: "user_01",
    evidence: [
      {
        digest: `sha256:${"a".repeat(64)}`,
        id: "evidence-001",
        mediaType: "application/pdf",
      },
    ],
    externalReference: "claim-001",
    hollisCaseReference: "HL-26-7M4K-P9Q2",
    escalatedAt: null,
    escalatedByUserId: null,
    escalationReason: null,
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

  it("returns the configured server-side session expiry at session establishment", async () => {
    const app = await buildApp(environment, createDependencies());
    apps.push(app);

    const before = Date.now();
    const response = await app.inject({
      method: "POST",
      payload: { identityToken: "identity-platform-token" },
      url: "/v1/auth/sessions",
    });
    const payload = response.json() as { expiresAt: string; sessionToken: string };

    expect(response.statusCode).toBe(201);
    expect(payload.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Date.parse(payload.expiresAt)).toBeGreaterThanOrEqual(
      before + environment.HOLLIS_SESSION_TTL_HOURS * 60 * 60 * 1000 - 1_000,
    );
  });

  it("creates a first workspace only from an unscoped authenticated session", async () => {
    let received: unknown;
    const workspaceProvisioner: WorkspaceProvisioner = {
      async create(input) {
        received = input;
        return {
          role: "owner",
          tenantId,
          workspaceName: "Northstar Claims",
        };
      },
    };
    const app = await buildApp(environment, createDependencies({ workspaceProvisioner }));
    apps.push(app);

    const response = await app.inject({
      headers: {
        authorization: "Bearer unscoped-token",
      },
      method: "POST",
      payload: { name: "Northstar Claims" },
      url: "/v1/workspaces",
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      activeWorkspace: { id: tenantId, name: "Northstar Claims", role: "owner" },
    });
    expect(received).toEqual({
      name: "Northstar Claims",
      userId: "user_01",
    });
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
      permissions: ["reviews:read"],
      role: "reviewer",
      tenantId,
      userId: "user_01",
    });
  });

  it("rejects a workspace that is not provisioned", async () => {
    const app = await buildApp(environment, createDependencies({ provisioned: false }));
    apps.push(app);

    const response = await app.inject({
      headers: { authorization: "Bearer verified-token" },
      method: "GET",
      url: "/v1/session",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      code: "workspace_not_provisioned",
      message: "The active workspace does not have Hollis access.",
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
            hollisCaseReference: "HL-26-7M4K-P9Q2",
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
      hollisCaseReference: "HL-26-7M4K-P9Q2",
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
      hollisCaseReference: "HL-26-7M4K-P9Q2",
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
        hollisCaseReference: "HL-26-7M4K-P9Q2",
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

  it("imports a verified finalized GenLayer attestation without a server signing key", async () => {
    let importerInput: unknown;
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
    const finalizedAttestationImporter: FinalizedAttestationImporter = {
      async importFinalized(input) {
        importerInput = input;
        return {
          contractAddress: "0x1fcA673F741CDE49A442E156Cfc2abE74dd25EA2",
          provider: "genlayer",
          providerSubmissionId: input.transactionHash,
          status: "finalized",
          transactionHash: input.transactionHash,
          verdict: "pass",
        };
      },
    };
    const attestationStore: AttestationStore = {
      async create(_tenantId, _caseId, _actorId, caseFile, publicCaseFileUrl, receipt) {
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
    const publicCaseFileId = "0198ef37-6216-7000-8000-000000000004";
    const publicCaseFileUrl = `https://api.hollis.test/v1/public/attestation-case-files/${publicCaseFileId}`;
    const publicCaseFile = buildAdjudicationCaseFile(
      completedExport,
      [{ digest: `sha256:${"a".repeat(64)}`, mediaType: "application/pdf", verified: true }],
      {
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
      },
    );
    const publicAttestationCaseFileStore: PublicAttestationCaseFileStore = {
      async create() {
        throw new Error("Not expected.");
      },
      async findForCase() {
        return {
          caseFile: publicCaseFile,
          createdAt: "2026-08-28T08:11:00.000Z",
          publicCaseFileUrl,
          publicId: publicCaseFileId,
        };
      },
      async findPublic() {
        throw new Error("Not expected.");
      },
      async list() {
        throw new Error("Not expected.");
      },
    };
    const app = await buildApp(
      environment,
      createDependencies({
        attestationStore,
        evidenceMetadataStore,
        finalizedAttestationImporter,
        publicAttestationCaseFileStore,
        permissions: ["reviews:attest"],
        workflowStore,
      }),
    );
    apps.push(app);

    const transactionHash = `0x${"b".repeat(64)}`;
    const response = await app.inject({
      headers: { authorization: "Bearer verified-token" },
      method: "POST",
      payload: {
        publicCaseFileId,
        transactionHash,
      },
      url: `/v1/review-cases/${completedExport.case.id}/attestations/import`,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      providerSubmissionId: transactionHash,
      status: "finalized",
      verdict: "pass",
    });
    expect(importerInput).toMatchObject({
      caseFile: { caseCommitment: completedExport.manifestHash },
      transactionHash,
    });
  });

  it("publishes only a generated privacy-safe case file through its public identifier", async () => {
    let published: Awaited<ReturnType<PublicAttestationCaseFileStore["create"]>> | undefined;
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
    const publicAttestationCaseFileStore: PublicAttestationCaseFileStore = {
      async create(_tenantId, _caseId, _actorId, publicId, caseFile, publicCaseFileUrl) {
        published = {
          caseFile,
          createdAt: "2026-08-28T08:11:00.000Z",
          publicCaseFileUrl,
          publicId,
        };
        return published;
      },
      async findForCase() {
        throw new Error("Not expected.");
      },
      async findPublic(publicId) {
        return published?.publicId === publicId ? published : null;
      },
      async list() {
        return published ? [published] : [];
      },
    };
    const app = await buildApp(
      environment,
      createDependencies({
        evidenceMetadataStore,
        permissions: ["reviews:attest"],
        publicAttestationCaseFileStore,
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
      },
      url: `/v1/review-cases/${completedExport.case.id}/attestation-case-files`,
    });

    expect(response.statusCode).toBe(201);
    const generated = response.json();
    expect(generated).toMatchObject({
      caseFile: {
        caseCommitment: completedExport.manifestHash,
        policy: { control: { controlId: "human-review-adverse-action" } },
      },
      publicCaseFileUrl: expect.stringMatching(
        /^https:\/\/api\.hollis\.test\/v1\/public\/attestation-case-files\//,
      ),
    });
    expect(generated.caseFile).not.toHaveProperty("externalReference");

    const publicResponse = await app.inject({
      method: "GET",
      url: `/v1/public/attestation-case-files/${generated.publicId}`,
    });
    expect(publicResponse.statusCode).toBe(200);
    expect(publicResponse.headers["cache-control"]).toBe("no-store");
    expect(publicResponse.json()).toEqual(generated.caseFile);
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

  it("lists only the caller's server-resolved workspaces", async () => {
    const workspaceControlsStore = {
      async listUserWorkspaces(userId: string) {
        expect(userId).toBe("user_01");
        return [{ tenantId, workspaceName: "Northstar Claims", role: "owner" }];
      },
    } as ReturnType<typeof createPostgresWorkspaceControlsStore>;
    const app = await buildApp(environment, createDependencies({ workspaceControlsStore }));
    apps.push(app);
    const response = await app.inject({
      headers: { authorization: "Bearer unscoped-token" },
      method: "GET",
      url: "/v1/workspaces",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { tenantId, workspaceName: "Northstar Claims", role: "owner" },
    ]);
  });

  it("does not accept an invitation without an authenticated session", async () => {
    const app = await buildApp(environment, createDependencies());
    apps.push(app);
    const response = await app.inject({
      method: "POST",
      payload: { token: "A".repeat(43) },
      url: "/v1/workspace-invitations/accept",
    });
    expect(response.statusCode).toBe(401);
  });
});
