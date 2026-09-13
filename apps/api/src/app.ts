import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import {
  createAttestationRequestSchema,
  createPolicyVersionSchema,
  createPublicAttestationCaseFileRequestSchema,
  createReviewCaseSchema,
  decideReviewCaseSchema,
  escalateReviewCaseSchema,
  importFinalizedAttestationRequestSchema,
  type ReviewExportIdentityLabels,
  reviewCaseStatusSchema,
} from "@hollis/contracts";
import { createDatabase } from "@hollis/database";
import Fastify, { LogController } from "fastify";
import { z } from "zod";
import type {
  AttestationProvider,
  AttestationStore,
  FinalizedAttestationImporter,
  PublicAttestationCaseFileStore,
} from "./attestation.js";
import {
  AttestationPreconditionError,
  buildAdjudicationCaseFile,
  buildGenLayerAttestationRequest,
} from "./attestation-workflow.js";
import {
  type AccessTokenVerifier,
  type ApplicationSessionStore,
  createHollisAccessTokenVerifier,
  createHollisUnscopedAccessTokenVerifier,
  InsufficientPermissionError,
  InvalidAccessTokenError,
  readBearerToken,
  type StoredApplicationSession,
  type UnscopedAccessTokenVerifier,
} from "./auth.js";
import { databaseConnectionFromEnvironment, type Environment } from "./config.js";
import { createConfiguredEvidenceStorage } from "./configured-evidence-storage.js";
import { EvidenceVerificationError, evidenceUploadSchema } from "./evidence.js";
import {
  createApplicationSessionToken,
  createIdentityPlatformTokenVerifier,
  digestApplicationSessionToken,
  type IdentityPlatformTokenVerifier,
  type VerifiedIdentityPlatformIdentity,
} from "./identity-platform.js";
import {
  createPostgresApplicationSessionStore,
  createPostgresAttestationStore,
  createPostgresEvidenceMetadataStore,
  createPostgresPolicyLibraryStore,
  createPostgresPublicAttestationCaseFileStore,
  createPostgresReviewIntakeStore,
  createPostgresReviewWorkflowStore,
  createPostgresTenantResolver,
  createPostgresWelcomeEmailDeliveryStore,
  createPostgresWorkspaceControlsStore,
  createPostgresWorkspaceProvisioningStore,
  setEvidenceLegalHold,
} from "./persistence.js";
import {
  assertPublishedCasePolicy,
  createPublishedPolicy,
  PolicyBindingError,
  type PolicyLibraryStore,
} from "./policy-library.js";
import {
  createInMemoryRateLimiter,
  createRateLimitPreHandler,
  type RateLimiter,
} from "./rate-limit.js";
import {
  createReviewIntake,
  ReviewIntakeConflictError,
  type ReviewIntakeStore,
  type TenantResolver,
} from "./review-intake.js";
import {
  createSecurityPreHandler,
  requireRequestContext,
  sendSecurityError,
  TenantAccessError,
} from "./security.js";
import { StudioDevAttestationVerificationError } from "./studio-dev-attestation.js";
import {
  createResendTransactionalEmailService,
  type TransactionalEmailService,
} from "./transactional-email.js";
import { claimsWebhookSchema, InvalidWebhookError, verifyClaimsWebhook } from "./webhook.js";
import type {
  PendingWelcomeEmailDelivery,
  WelcomeEmailDeliveryStore,
} from "./welcome-email-delivery.js";
import {
  ReviewCaseNotFoundError,
  ReviewCaseTransitionError,
  type ReviewWorkflowStore,
  toDetailResponse,
  toExportResponse,
  toQueueResponse,
  toWorkflowResponse,
} from "./workflow.js";
import {
  acceptInvitationSchema,
  changeMemberRoleSchema,
  createInvitationSchema,
  createInvitationToken,
  workspaceProfileSchema,
} from "./workspace-controls.js";
import {
  createHollisWorkspaceProvisioner,
  createWorkspaceSchema,
  type WorkspaceProvisioner,
  WorkspaceProvisioningError,
} from "./workspace-provisioning.js";

type AppDependencies = {
  accessTokenVerifier?: AccessTokenVerifier;
  reviewIntakeStore?: ReviewIntakeStore;
  policyLibraryStore?: PolicyLibraryStore;
  tenantResolver?: TenantResolver;
  workflowStore?: ReviewWorkflowStore;
  evidenceStorage?: import("./evidence-storage.js").EvidenceStorage;
  evidenceMetadataStore?: import("./evidence.js").EvidenceMetadataStore;
  attestationProvider?: AttestationProvider;
  finalizedAttestationImporter?: FinalizedAttestationImporter;
  publicAttestationCaseFileStore?: PublicAttestationCaseFileStore;
  attestationStore?: AttestationStore;
  legalHoldStore?: (
    tenantId: string,
    caseId: string,
    evidenceId: string,
    active: boolean,
    actorId: string,
  ) => Promise<boolean>;
  workspaceProvisioner?: WorkspaceProvisioner;
  unscopedAccessTokenVerifier?: UnscopedAccessTokenVerifier;
  applicationSessionStore?: ApplicationSessionStore;
  identityPlatformTokenVerifier?: IdentityPlatformTokenVerifier;
  workspaceControlsStore?: ReturnType<typeof createPostgresWorkspaceControlsStore>;
  transactionalEmailService?: TransactionalEmailService | null;
  welcomeEmailDeliveryStore?: WelcomeEmailDeliveryStore;
  rateLimiter?: RateLimiter;
};

const rateLimitPolicies = {
  attestation: { maxRequests: 10, windowMs: 60 * 60 * 1000 },
  claimsWebhook: { maxRequests: 10, windowMs: 60 * 1000 },
  evidenceUpload: { maxRequests: 30, windowMs: 60 * 60 * 1000 },
  export: { maxRequests: 60, windowMs: 60 * 60 * 1000 },
  exportIdentity: { maxRequests: 60, windowMs: 60 * 60 * 1000 },
  invitation: { maxRequests: 30, windowMs: 60 * 60 * 1000 },
  sessionExchange: { maxRequests: 10, windowMs: 15 * 60 * 1000 },
  workspaceSetup: { maxRequests: 10, windowMs: 60 * 60 * 1000 },
} as const;

export async function buildApp(environment: Environment, dependencies: AppDependencies = {}) {
  const rateLimiter = dependencies.rateLimiter ?? createInMemoryRateLimiter();
  const rateLimit = (scope: keyof typeof rateLimitPolicies) =>
    createRateLimitPreHandler(rateLimiter, scope, rateLimitPolicies[scope]);
  const databaseResource =
    dependencies.reviewIntakeStore &&
    dependencies.tenantResolver &&
    dependencies.workflowStore &&
    dependencies.evidenceMetadataStore &&
    dependencies.publicAttestationCaseFileStore &&
    dependencies.applicationSessionStore
      ? null
      : createDatabase(databaseConnectionFromEnvironment(environment));

  function requireDatabase() {
    if (!databaseResource) {
      throw new Error("Database dependencies are incomplete.");
    }

    return databaseResource.database;
  }

  const reviewIntakeStore =
    dependencies.reviewIntakeStore ?? createPostgresReviewIntakeStore(requireDatabase());
  const policyLibraryStore =
    dependencies.policyLibraryStore ?? createPostgresPolicyLibraryStore(requireDatabase());
  const tenantResolver =
    dependencies.tenantResolver ?? createPostgresTenantResolver(requireDatabase());
  const workflowStore =
    dependencies.workflowStore ?? createPostgresReviewWorkflowStore(requireDatabase());
  const evidenceMetadataStore =
    dependencies.evidenceMetadataStore ?? createPostgresEvidenceMetadataStore(requireDatabase());
  const attestationStore =
    dependencies.attestationStore ??
    (databaseResource ? createPostgresAttestationStore(databaseResource.database) : null);
  const publicAttestationCaseFileStore =
    dependencies.publicAttestationCaseFileStore ??
    (databaseResource
      ? createPostgresPublicAttestationCaseFileStore(databaseResource.database)
      : null);
  const legalHoldStore =
    dependencies.legalHoldStore ??
    ((tenantId, caseId, evidenceId, active, actorId) =>
      setEvidenceLegalHold(requireDatabase(), tenantId, caseId, evidenceId, active, actorId));
  const workspaceProvisioner =
    dependencies.workspaceProvisioner ??
    createHollisWorkspaceProvisioner(createPostgresWorkspaceProvisioningStore(requireDatabase()));
  const applicationSessionStore =
    dependencies.applicationSessionStore ??
    createPostgresApplicationSessionStore(requireDatabase());
  const welcomeEmailDeliveryStore =
    dependencies.welcomeEmailDeliveryStore ??
    (databaseResource
      ? createPostgresWelcomeEmailDeliveryStore(databaseResource.database)
      : (() => {
          const unavailable = async () => {
            throw new Error("Welcome email delivery dependencies are unavailable.");
          };
          return {
            claimPending: unavailable,
            markFailed: unavailable,
            markSent: unavailable,
            recordNewUser: unavailable,
          } as WelcomeEmailDeliveryStore;
        })());
  const transactionalEmailService =
    dependencies.transactionalEmailService ??
    (environment.RESEND_API_KEY && environment.RESEND_FROM
      ? createResendTransactionalEmailService({
          apiKey: environment.RESEND_API_KEY,
          from: environment.RESEND_FROM,
        })
      : null);
  const workspaceControlsStore =
    dependencies.workspaceControlsStore ??
    (databaseResource
      ? createPostgresWorkspaceControlsStore(databaseResource.database)
      : (() => {
          const unavailable = async () => {
            throw new Error("Workspace control dependencies are unavailable.");
          };
          return {
            acceptInvitation: unavailable,
            changeMemberRole: unavailable,
            createInvitation: unavailable,
            getMemberIdentity: unavailable,
            getProfile: unavailable,
            listInvitations: unavailable,
            listAuditEvents: unavailable,
            listMembers: unavailable,
            listUserWorkspaces: unavailable,
            revokeInvitation: unavailable,
            searchMembers: unavailable,
            updateProfile: unavailable,
          } as ReturnType<typeof createPostgresWorkspaceControlsStore>;
        })());
  const accessTokenVerifier =
    dependencies.accessTokenVerifier ?? createHollisAccessTokenVerifier(applicationSessionStore);
  const unscopedAccessTokenVerifier =
    dependencies.unscopedAccessTokenVerifier ??
    createHollisUnscopedAccessTokenVerifier(applicationSessionStore);
  const identityPlatformTokenVerifier =
    dependencies.identityPlatformTokenVerifier ?? createIdentityPlatformTokenVerifier(environment);
  const evidenceStorage =
    dependencies.evidenceStorage ?? (await createConfiguredEvidenceStorage(environment));
  const app = Fastify({
    bodyLimit: 262_144,
    logController: new LogController({ disableRequestLogging: true }),
    logger: environment.NODE_ENV !== "test",
    trustProxy: false,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });
  await app.register(cors, {
    credentials: true,
    methods: ["DELETE", "GET", "PATCH", "POST", "PUT"],
    origin: environment.WEB_ORIGIN,
  });

  app.decorateRequest("principal", null);
  app.decorateRequest("tenant", null);

  app.addHook("onResponse", (request, reply, done) => {
    if (reply.statusCode >= 400) {
      app.log.warn(
        {
          method: request.method,
          path: request.routeOptions.url ?? request.url,
          statusCode: reply.statusCode,
        },
        "request rejected",
      );
    }
    done();
  });

  const caseParamsSchema = z.object({ caseId: z.uuid() }).strict();
  const attestationParamsSchema = z.object({ attestationId: z.uuid(), caseId: z.uuid() }).strict();
  const publicCaseFileParamsSchema = z.object({ publicCaseFileId: z.uuid() }).strict();
  const evidenceParamsSchema = z.object({ caseId: z.uuid(), evidenceId: z.uuid() }).strict();
  const legalHoldSchema = z.object({ active: z.boolean() }).strict();
  const identitySessionSchema = z.object({ identityToken: z.string().min(1) }).strict();
  const activateWorkspaceSchema = z.object({ tenantId: z.uuid() }).strict();
  const memberParamsSchema = z.object({ userId: z.uuid() }).strict();
  const invitationParamsSchema = z.object({ invitationId: z.uuid() }).strict();

  async function deliverWelcomeEmail(input: {
    displayName: string | null;
    isNewUser: boolean;
    userId: string;
  }) {
    if (input.isNewUser) {
      try {
        await welcomeEmailDeliveryStore.recordNewUser(input.userId);
      } catch (error) {
        app.log.error(
          { errorName: error instanceof Error ? error.name : "unknown" },
          "welcome email delivery record failed",
        );
        return;
      }
    }

    if (!transactionalEmailService) return;

    let delivery: PendingWelcomeEmailDelivery | null;
    try {
      delivery = await welcomeEmailDeliveryStore.claimPending(input.userId);
    } catch (error) {
      app.log.error(
        { errorName: error instanceof Error ? error.name : "unknown" },
        "welcome email delivery claim failed",
      );
      return;
    }
    if (!delivery) return;

    try {
      const result = await transactionalEmailService.sendWelcome({
        deliveryId: delivery.deliveryId,
        displayName: input.displayName,
        recipientEmail: delivery.recipientEmail,
        userId: input.userId,
      });
      await welcomeEmailDeliveryStore.markSent(delivery.deliveryId, result.providerMessageId);
    } catch (error) {
      app.log.error(
        { errorName: error instanceof Error ? error.name : "unknown" },
        "welcome email delivery failed",
      );
      try {
        await welcomeEmailDeliveryStore.markFailed(delivery.deliveryId);
      } catch (recordError) {
        app.log.error(
          { errorName: recordError instanceof Error ? recordError.name : "unknown" },
          "welcome email failure record failed",
        );
      }
    }
  }

  if (databaseResource) {
    app.addHook("onClose", async () => databaseResource.client.end());
  }

  app.setErrorHandler((error, _request, reply) => {
    if (
      error instanceof InvalidAccessTokenError ||
      error instanceof InsufficientPermissionError ||
      error instanceof TenantAccessError
    ) {
      app.log.warn({ securityError: error.name }, "request rejected by security policy");
    }

    if (sendSecurityError(error, reply)) {
      return;
    }

    if (error instanceof InvalidWebhookError) {
      return reply
        .code(401)
        .send({ code: "invalid_webhook", message: "Webhook authentication failed." });
    }

    if (error instanceof ReviewIntakeConflictError) {
      return reply.code(409).send({
        code: "intake_conflict",
        message: "The external reference already exists with different content.",
      });
    }

    if (error instanceof PolicyBindingError) {
      return reply.code(409).send({
        code: "policy_not_published",
        message: "The selected policy control is not published for this workspace.",
      });
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "FST_ERR_CTP_INVALID_JSON_BODY"
    ) {
      return reply
        .code(400)
        .send({ code: "invalid_request", message: "Request validation failed." });
    }

    if (error instanceof z.ZodError) {
      return reply
        .code(400)
        .send({ code: "invalid_request", message: "Request validation failed." });
    }

    if (error instanceof ReviewCaseNotFoundError) {
      return reply
        .code(404)
        .send({ code: "review_case_not_found", message: "Review case not found." });
    }

    if (error instanceof ReviewCaseTransitionError) {
      return reply
        .code(409)
        .send({ code: "invalid_transition", message: "Review case transition is not allowed." });
    }

    if (error instanceof EvidenceVerificationError) {
      return reply.code(422).send({
        code: "evidence_verification_failed",
        message: "Evidence object does not match its declared metadata.",
      });
    }

    if (error instanceof AttestationPreconditionError) {
      return reply.code(409).send({ code: "attestation_not_ready", message: error.message });
    }

    if (error instanceof StudioDevAttestationVerificationError) {
      return reply.code(422).send({
        code: "attestation_verification_failed",
        message: "The finalized GenLayer attestation could not be verified for this case.",
      });
    }

    if (error instanceof WorkspaceProvisioningError) {
      app.log.error(
        { diagnostic: error.diagnostic, provisioningCode: error.code },
        "workspace provisioning failed",
      );
      return reply.code(502).send({
        code: error.code,
        message: "Workspace provisioning could not be completed.",
      });
    }

    const errorCode =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : undefined;
    app.log.error(
      { errorCode, errorName: error instanceof Error ? error.name : "unknown" },
      "request failed",
    );
    return reply.code(500).send({ code: "internal_error", message: "Request failed." });
  });

  app.get("/health/live", async () => ({ status: "ok" }));

  app.post(
    "/v1/auth/sessions",
    { preHandler: rateLimit("sessionExchange") },
    async (request, reply) => {
      const input = identitySessionSchema.parse(request.body);
      let identity: VerifiedIdentityPlatformIdentity;
      try {
        identity = await identityPlatformTokenVerifier.verify(input.identityToken);
      } catch (error) {
        app.log.warn(
          { errorName: error instanceof Error ? error.name : "unknown" },
          "identity token verification failed",
        );
        throw error;
      }
      const sessionToken = createApplicationSessionToken();
      const expiresAt = new Date(
        Date.now() + environment.HOLLIS_SESSION_TTL_HOURS * 60 * 60 * 1000,
      );
      let session: StoredApplicationSession;
      try {
        session = await applicationSessionStore.establish({
          ...identity,
          expiresAt,
          tokenDigest: digestApplicationSessionToken(sessionToken),
        });
      } catch (error) {
        app.log.error(
          { errorName: error instanceof Error ? error.name : "unknown" },
          "application session establishment failed",
        );
        throw error;
      }
      await deliverWelcomeEmail({
        displayName: identity.displayName,
        isNewUser: session.isNewUser,
        userId: session.userId,
      });
      return reply.code(201).send({
        activeWorkspace: session.tenantId
          ? { id: session.tenantId, name: session.workspaceName, role: session.role }
          : null,
        expiresAt: expiresAt.toISOString(),
        sessionToken,
        userId: session.userId,
      });
    },
  );

  app.delete("/v1/auth/sessions/current", async (request, reply) => {
    const token = readBearerToken(request.headers.authorization);
    await applicationSessionStore.revoke(digestApplicationSessionToken(token));
    return reply.code(204).send();
  });

  app.get("/v1/auth/me", async (request) => {
    const principal = await unscopedAccessTokenVerifier.verify(
      readBearerToken(request.headers.authorization),
    );
    return {
      activeWorkspace: principal.activeWorkspace,
      sessionId: principal.sessionId,
      userId: principal.userId,
    };
  });

  app.post("/v1/auth/active-workspace", async (request, reply) => {
    const token = readBearerToken(request.headers.authorization);
    const input = activateWorkspaceSchema.parse(request.body);
    const session = await applicationSessionStore.activate(
      digestApplicationSessionToken(token),
      input.tenantId,
    );
    if (!session?.tenantId || !session.workspaceName || !session.role) {
      throw new InvalidAccessTokenError();
    }
    return reply.send({
      activeWorkspace: { id: session.tenantId, name: session.workspaceName, role: session.role },
      userId: session.userId,
    });
  });

  app.post(
    "/v1/workspaces",
    { preHandler: rateLimit("workspaceSetup") },
    async (request, reply) => {
      const principal = await unscopedAccessTokenVerifier.verify(
        readBearerToken(request.headers.authorization),
      );
      const input = createWorkspaceSchema.parse(request.body);
      const workspace = await workspaceProvisioner.create({
        name: input.name,
        userId: principal.userId,
      });
      const token = readBearerToken(request.headers.authorization);
      const session = await applicationSessionStore.activate(
        digestApplicationSessionToken(token),
        workspace.tenantId,
      );
      if (!session?.tenantId || !session.workspaceName || !session.role) {
        throw new WorkspaceProvisioningError("tenant_provisioning_failed", "session:activation");
      }
      return reply.code(201).send({
        activeWorkspace: { id: session.tenantId, name: session.workspaceName, role: session.role },
      });
    },
  );

  app.get("/v1/workspaces", async (request) => {
    const principal = await unscopedAccessTokenVerifier.verify(
      readBearerToken(request.headers.authorization),
    );
    return workspaceControlsStore.listUserWorkspaces(principal.userId);
  });

  app.post(
    "/v1/workspace-invitations/accept",
    { preHandler: rateLimit("workspaceSetup") },
    async (request, reply) => {
      const token = readBearerToken(request.headers.authorization);
      const principal = await unscopedAccessTokenVerifier.verify(token);
      const input = acceptInvitationSchema.parse(request.body);
      const accepted = await workspaceControlsStore.acceptInvitation(input.token, principal.userId);
      if (!accepted)
        return reply
          .code(404)
          .send({ code: "invitation_unavailable", message: "This invitation is unavailable." });
      const session = await applicationSessionStore.activate(
        digestApplicationSessionToken(token),
        accepted.tenantId,
      );
      if (!session?.tenantId || !session.workspaceName || !session.role)
        throw new InvalidAccessTokenError();
      return reply.send({
        activeWorkspace: { id: session.tenantId, name: session.workspaceName, role: session.role },
      });
    },
  );

  app.get("/v1/public/attestation-case-files/:publicCaseFileId", async (request, reply) => {
    if (!environment.PUBLIC_ATTESTATION_ORIGIN || !publicAttestationCaseFileStore) {
      return reply.code(404).send({ code: "not_found", message: "Not found." });
    }
    const { publicCaseFileId } = publicCaseFileParamsSchema.parse(request.params);
    const publicCaseFileUrl = publicAttestationCaseFileUrl(
      environment.PUBLIC_ATTESTATION_ORIGIN,
      publicCaseFileId,
    );
    const record = await publicAttestationCaseFileStore.findPublic(
      publicCaseFileId,
      publicCaseFileUrl,
    );
    if (!record) return reply.code(404).send({ code: "not_found", message: "Not found." });

    return reply.header("cache-control", "no-store").type("application/json").send(record.caseFile);
  });

  app.post(
    "/v1/webhooks/claims",
    { preHandler: rateLimit("claimsWebhook") },
    async (request, reply) => {
      if (!environment.CLAIMS_WEBHOOK_SECRET) {
        throw new InvalidWebhookError();
      }

      const payload = claimsWebhookSchema.parse(request.body);
      verifyClaimsWebhook(
        payload,
        {
          idempotencyKey:
            typeof request.headers["idempotency-key"] === "string"
              ? request.headers["idempotency-key"]
              : undefined,
          signature:
            typeof request.headers["x-hollis-signature"] === "string"
              ? request.headers["x-hollis-signature"]
              : undefined,
          timestamp:
            typeof request.headers["x-hollis-timestamp"] === "string"
              ? request.headers["x-hollis-timestamp"]
              : undefined,
        },
        environment.CLAIMS_WEBHOOK_SECRET,
      );
      return reply.code(503).send({
        code: "claims_workspace_resolution_unconfigured",
        message: "Claims intake is not configured for public workspaces.",
      });
    },
  );

  app.get(
    "/v1/session",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver) },
    async (request) => {
      const { principal, tenant } = requireRequestContext(request);
      return {
        permissions: principal.permissions,
        role: principal.role,
        tenantId: tenant.id,
        userId: principal.userId,
      };
    },
  );

  app.get(
    "/v1/workspace",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "workspace:read") },
    async (request) => {
      const { tenant } = requireRequestContext(request);
      return workspaceControlsStore.getProfile(tenant.id);
    },
  );
  app.put(
    "/v1/workspace",
    {
      preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "workspace:manage"),
    },
    async (request) => {
      const { principal, tenant } = requireRequestContext(request);
      return workspaceControlsStore.updateProfile(
        tenant.id,
        principal.userId,
        workspaceProfileSchema.parse(request.body),
      );
    },
  );
  app.get(
    "/v1/workspace/members",
    {
      preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "workspace:read"),
    },
    async (request) => {
      const { principal, tenant } = requireRequestContext(request);
      const canManage = principal.permissions.includes("workspace:manage");
      const members = await workspaceControlsStore.listMembers(tenant.id, principal.userId);
      return members.map(({ userId, ...member }) => ({
        ...member,
        isCurrentUser: userId === principal.userId,
        userId: canManage ? userId : null,
      }));
    },
  );
  app.get(
    "/v1/workspace/search/reviewers",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:read") },
    async (request) => {
      const { q } = z
        .object({ q: z.string().trim().min(2).max(120) })
        .strict()
        .parse(request.query);
      const { tenant } = requireRequestContext(request);
      return workspaceControlsStore.searchMembers(tenant.id, q);
    },
  );
  app.patch(
    "/v1/workspace/members/:userId",
    {
      preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "workspace:manage"),
    },
    async (request) => {
      const { principal, tenant } = requireRequestContext(request);
      const { userId } = memberParamsSchema.parse(request.params);
      return workspaceControlsStore.changeMemberRole(
        tenant.id,
        principal.userId,
        userId,
        changeMemberRoleSchema.parse(request.body).role,
      );
    },
  );
  app.get(
    "/v1/workspace/invitations",
    {
      preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "workspace:manage"),
    },
    async (request) => {
      const { tenant } = requireRequestContext(request);
      return workspaceControlsStore.listInvitations(tenant.id);
    },
  );
  app.get(
    "/v1/workspace/audit-events",
    {
      preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "workspace:manage"),
    },
    async (request) => {
      const { tenant } = requireRequestContext(request);
      return workspaceControlsStore.listAuditEvents(tenant.id);
    },
  );
  app.post(
    "/v1/workspace/invitations",
    {
      preHandler: [
        rateLimit("invitation"),
        createSecurityPreHandler(accessTokenVerifier, tenantResolver, "workspace:manage"),
      ],
    },
    async (request, reply) => {
      const { principal, tenant } = requireRequestContext(request);
      const input = createInvitationSchema.parse(request.body);
      if (principal.role === "administrator" && input.role === "administrator")
        return reply
          .code(403)
          .send({ code: "owner_required", message: "Only an owner may invite an administrator." });
      const token = createInvitationToken();
      const invitation = await workspaceControlsStore.createInvitation(
        tenant.id,
        principal.userId,
        { ...input, token },
      );
      return reply.code(201).send({ ...invitation, token });
    },
  );
  app.delete(
    "/v1/workspace/invitations/:invitationId",
    {
      preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "workspace:manage"),
    },
    async (request, reply) => {
      const { principal, tenant } = requireRequestContext(request);
      const { invitationId } = invitationParamsSchema.parse(request.params);
      const revoked = await workspaceControlsStore.revokeInvitation(
        tenant.id,
        principal.userId,
        invitationId,
      );
      if (!revoked)
        return reply
          .code(404)
          .send({ code: "invitation_unavailable", message: "This invitation is unavailable." });
      return reply.code(204).send();
    },
  );

  app.get(
    "/v1/review-cases/:caseId/attestations",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:read") },
    async (request, reply) => {
      if (!attestationStore)
        return reply.code(503).send({
          code: "attestation_unconfigured",
          message: "Attestation storage is not configured.",
        });
      const { caseId } = caseParamsSchema.parse(request.params);
      const { tenant } = requireRequestContext(request);
      return attestationStore.list(tenant.id, caseId);
    },
  );

  app.get(
    "/v1/review-cases/:caseId/attestation-case-files",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:read") },
    async (request, reply) => {
      if (!environment.PUBLIC_ATTESTATION_ORIGIN || !publicAttestationCaseFileStore) {
        return reply.code(503).send({
          code: "attestation_publisher_unconfigured",
          message: "The public attestation case-file publisher is not configured.",
        });
      }
      const { caseId } = caseParamsSchema.parse(request.params);
      const { tenant } = requireRequestContext(request);
      return publicAttestationCaseFileStore.list(
        tenant.id,
        caseId,
        environment.PUBLIC_ATTESTATION_ORIGIN,
      );
    },
  );

  app.post(
    "/v1/review-cases/:caseId/attestations",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:attest") },
    async (request, reply) => {
      if (!dependencies.attestationProvider || !attestationStore)
        return reply.code(503).send({
          code: "attestation_unconfigured",
          message: "GenLayer attestation is not activated.",
        });
      const { caseId } = caseParamsSchema.parse(request.params);
      const input = createAttestationRequestSchema.parse(request.body);
      const { principal, tenant } = requireRequestContext(request);
      const exported = await workflowStore.exportCase(tenant.id, caseId);
      if (!exported) throw new ReviewCaseNotFoundError();
      const caseFile = buildGenLayerAttestationRequest(
        exported,
        await evidenceMetadataStore.list(tenant.id, caseId),
        input,
      );
      const receipt = await dependencies.attestationProvider.submit(caseFile);
      return reply
        .code(201)
        .send(
          await attestationStore.create(
            tenant.id,
            caseId,
            principal.userId,
            caseFile.caseFile,
            caseFile.publicCaseFileUrl,
            receipt,
          ),
        );
    },
  );

  app.post(
    "/v1/review-cases/:caseId/attestation-case-files",
    {
      preHandler: [
        rateLimit("attestation"),
        createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:attest"),
      ],
    },
    async (request, reply) => {
      if (!environment.PUBLIC_ATTESTATION_ORIGIN || !publicAttestationCaseFileStore) {
        return reply.code(503).send({
          code: "attestation_publisher_unconfigured",
          message: "The public attestation case-file publisher is not configured.",
        });
      }
      const { caseId } = caseParamsSchema.parse(request.params);
      const input = createPublicAttestationCaseFileRequestSchema.parse(request.body);
      const { principal, tenant } = requireRequestContext(request);
      const exported = await workflowStore.exportCase(tenant.id, caseId);
      if (!exported) throw new ReviewCaseNotFoundError();
      const publicId = randomUUID();
      const publicCaseFileUrl = publicAttestationCaseFileUrl(
        environment.PUBLIC_ATTESTATION_ORIGIN,
        publicId,
      );
      const caseFile = buildAdjudicationCaseFile(
        exported,
        await evidenceMetadataStore.list(tenant.id, caseId),
        input,
      );
      return reply
        .code(201)
        .send(
          await publicAttestationCaseFileStore.create(
            tenant.id,
            caseId,
            principal.userId,
            publicId,
            caseFile,
            publicCaseFileUrl,
          ),
        );
    },
  );

  app.post(
    "/v1/review-cases/:caseId/attestations/import",
    {
      preHandler: [
        rateLimit("attestation"),
        createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:attest"),
      ],
    },
    async (request, reply) => {
      if (!dependencies.finalizedAttestationImporter || !attestationStore) {
        return reply.code(503).send({
          code: "attestation_unconfigured",
          message: "Finalized GenLayer attestation import is not activated.",
        });
      }
      const { caseId } = caseParamsSchema.parse(request.params);
      const input = importFinalizedAttestationRequestSchema.parse(request.body);
      const { principal, tenant } = requireRequestContext(request);
      if (!environment.PUBLIC_ATTESTATION_ORIGIN || !publicAttestationCaseFileStore) {
        return reply.code(503).send({
          code: "attestation_publisher_unconfigured",
          message: "The public attestation case-file publisher is not configured.",
        });
      }
      const publicCaseFileUrl = publicAttestationCaseFileUrl(
        environment.PUBLIC_ATTESTATION_ORIGIN,
        input.publicCaseFileId,
      );
      const publicCaseFile = await publicAttestationCaseFileStore.findForCase(
        tenant.id,
        caseId,
        input.publicCaseFileId,
        publicCaseFileUrl,
      );
      if (!publicCaseFile) {
        return reply.code(404).send({
          code: "public_attestation_case_file_not_found",
          message: "Public attestation case file not found.",
        });
      }
      const receipt = await dependencies.finalizedAttestationImporter.importFinalized({
        caseFile: publicCaseFile.caseFile,
        publicCaseFileUrl: publicCaseFile.publicCaseFileUrl,
        transactionHash: input.transactionHash,
      });
      return reply
        .code(201)
        .send(
          await attestationStore.create(
            tenant.id,
            caseId,
            principal.userId,
            publicCaseFile.caseFile,
            publicCaseFile.publicCaseFileUrl,
            receipt,
          ),
        );
    },
  );

  app.post(
    "/v1/review-cases/:caseId/evidence/:evidenceId/verify",
    {
      preHandler: [
        rateLimit("evidenceUpload"),
        createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:create"),
      ],
    },
    async (request, reply) => {
      if (!evidenceStorage)
        return reply
          .code(503)
          .send({ code: "storage_unconfigured", message: "Evidence storage is not configured." });
      const { caseId, evidenceId } = evidenceParamsSchema.parse(request.params);
      const { tenant } = requireRequestContext(request);
      const { verifyEvidenceUpload } = await import("./evidence.js");
      const verified = await verifyEvidenceUpload(
        tenant.id,
        caseId,
        evidenceId,
        evidenceStorage,
        evidenceMetadataStore,
      );
      if (!verified)
        return reply.code(404).send({ code: "evidence_not_found", message: "Evidence not found." });
      return reply.code(204).send();
    },
  );

  app.post(
    "/v1/review-cases",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:create") },
    async (request, reply) => {
      const input = createReviewCaseSchema.parse(request.body);
      const { principal, tenant } = requireRequestContext(request);
      assertPublishedCasePolicy(
        await policyLibraryStore.findControl(tenant.id, input.policyVersion, input.ruleId),
        input.policyVersion,
        input.ruleId,
      );
      const reviewCase = await createReviewIntake(
        input,
        { actorId: principal.userId, tenantId: tenant.id },
        reviewIntakeStore,
      );

      return reply.code(reviewCase.replayed ? 200 : 201).send(reviewCase);
    },
  );

  app.get(
    "/v1/policies",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:read") },
    async (request) => {
      const { tenant } = requireRequestContext(request);
      return policyLibraryStore.list(tenant.id);
    },
  );

  app.post(
    "/v1/policies",
    {
      preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "policies:manage"),
    },
    async (request, reply) => {
      const input = createPolicyVersionSchema.parse(request.body);
      const { principal, tenant } = requireRequestContext(request);
      return reply
        .code(201)
        .send(await createPublishedPolicy(tenant.id, principal.userId, input, policyLibraryStore));
    },
  );

  app.post(
    "/v1/review-cases/:caseId/evidence/:evidenceId/legal-hold",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:retain") },
    async (request, reply) => {
      const { caseId, evidenceId } = evidenceParamsSchema.parse(request.params);
      const { active } = legalHoldSchema.parse(request.body);
      const { principal, tenant } = requireRequestContext(request);
      const updated = await legalHoldStore(tenant.id, caseId, evidenceId, active, principal.userId);
      if (!updated)
        return reply.code(404).send({ code: "evidence_not_found", message: "Evidence not found." });
      return reply.code(204).send();
    },
  );

  app.get(
    "/v1/review-cases",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:read") },
    async (request) => {
      const query = z
        .object({ status: reviewCaseStatusSchema.optional() })
        .strict()
        .parse(request.query);
      const { tenant } = requireRequestContext(request);
      const queue = await workflowStore.list(tenant.id, query.status);
      return queue.map(toQueueResponse);
    },
  );

  app.post(
    "/v1/review-cases/:caseId/attestations/:attestationId/refresh",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:attest") },
    async (request, reply) => {
      if (!dependencies.attestationProvider || !attestationStore)
        return reply.code(503).send({
          code: "attestation_unconfigured",
          message: "GenLayer attestation is not activated.",
        });
      const { attestationId, caseId } = attestationParamsSchema.parse(request.params);
      const { tenant } = requireRequestContext(request);
      const existing = (await attestationStore.list(tenant.id, caseId)).find(
        (attestation) => attestation.id === attestationId,
      );
      if (!existing) {
        return reply
          .code(404)
          .send({ code: "attestation_not_found", message: "Attestation not found." });
      }
      const receipt = await dependencies.attestationProvider.get(existing.providerSubmissionId);
      const updated = await attestationStore.update(tenant.id, caseId, attestationId, receipt);
      if (!updated) {
        return reply
          .code(404)
          .send({ code: "attestation_not_found", message: "Attestation not found." });
      }
      return updated;
    },
  );

  app.post(
    "/v1/review-cases/:caseId/evidence/uploads",
    {
      preHandler: [
        rateLimit("evidenceUpload"),
        createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:create"),
      ],
    },
    async (request, reply) => {
      if (!evidenceStorage)
        return reply
          .code(503)
          .send({ code: "storage_unconfigured", message: "Evidence storage is not configured." });
      const { caseId } = caseParamsSchema.parse(request.params);
      const input = evidenceUploadSchema.parse(request.body);
      const { tenant } = requireRequestContext(request);
      const { createEvidenceUpload } = await import("./evidence.js");
      return reply
        .code(201)
        .send(
          await createEvidenceUpload(
            tenant.id,
            caseId,
            input,
            evidenceStorage,
            evidenceMetadataStore,
          ),
        );
    },
  );

  app.get(
    "/v1/review-cases/:caseId/evidence/:evidenceId/download",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:read") },
    async (request, reply) => {
      if (!evidenceStorage)
        return reply
          .code(503)
          .send({ code: "storage_unconfigured", message: "Evidence storage is not configured." });
      const { caseId, evidenceId } = evidenceParamsSchema.parse(request.params);
      const { tenant } = requireRequestContext(request);
      const { createEvidenceDownload } = await import("./evidence.js");
      const url = await createEvidenceDownload(
        tenant.id,
        caseId,
        evidenceId,
        evidenceStorage,
        evidenceMetadataStore,
      );
      if (!url)
        return reply.code(404).send({ code: "evidence_not_found", message: "Evidence not found." });
      return { downloadUrl: url };
    },
  );

  app.get(
    "/v1/review-cases/:caseId",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:read") },
    async (request) => {
      const { caseId } = caseParamsSchema.parse(request.params);
      const { principal, tenant } = requireRequestContext(request);
      const reviewCase = await workflowStore.get(tenant.id, caseId);
      if (!reviewCase) {
        throw new ReviewCaseNotFoundError();
      }

      const assignedReviewer = reviewCase.assignedToUserId
        ? await workspaceControlsStore.getMemberIdentity(
            tenant.id,
            principal.userId,
            reviewCase.assignedToUserId,
          )
        : null;

      return toDetailResponse(reviewCase, assignedReviewer);
    },
  );

  app.get(
    "/v1/review-cases/:caseId/export",
    {
      preHandler: [
        rateLimit("export"),
        createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:read"),
      ],
    },
    async (request) => {
      const { caseId } = caseParamsSchema.parse(request.params);
      const { tenant } = requireRequestContext(request);
      const exported = await workflowStore.exportCase(tenant.id, caseId);
      if (!exported) {
        throw new ReviewCaseNotFoundError();
      }

      return toExportResponse(exported);
    },
  );

  app.get(
    "/v1/review-cases/:caseId/export-identities",
    {
      preHandler: [
        rateLimit("exportIdentity"),
        createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:read"),
      ],
    },
    async (request) => {
      const { caseId } = caseParamsSchema.parse(request.params);
      const { principal, tenant } = requireRequestContext(request);
      const exported = await workflowStore.exportCase(tenant.id, caseId);
      if (!exported) {
        throw new ReviewCaseNotFoundError();
      }

      const actorIds = new Set(
        [
          exported.case.assignedToUserId,
          exported.case.decidedByUserId,
          exported.case.escalatedByUserId,
          ...exported.events.map((event) => event.actorId),
        ].filter((actorId): actorId is string => Boolean(actorId)),
      );
      const systemLabels = new Map([
        ["attestation-provider", "GenLayer attestation service"],
        ["retention-system", "Hollis retention service"],
      ]);
      const identities = await Promise.all(
        [...actorIds].map(async (actorId) => {
          const systemLabel = systemLabels.get(actorId);
          if (systemLabel) return { actorId, displayName: systemLabel };
          const identity = await workspaceControlsStore.getMemberIdentity(
            tenant.id,
            principal.userId,
            actorId,
          );
          const displayName = identity?.displayName?.trim();
          return displayName ? { actorId, displayName } : null;
        }),
      );

      return {
        identities: identities.filter(
          (identity): identity is ReviewExportIdentityLabels["identities"][number] =>
            identity !== null,
        ),
      } satisfies ReviewExportIdentityLabels;
    },
  );

  app.post(
    "/v1/review-cases/:caseId/claim",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:assign") },
    async (request) => {
      const { caseId } = caseParamsSchema.parse(request.params);
      const { principal, tenant } = requireRequestContext(request);
      const result = await workflowStore.claim(tenant.id, principal.userId, caseId);
      return toWorkflowResponse(result);
    },
  );

  app.post(
    "/v1/review-cases/:caseId/escalate",
    {
      preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:escalate"),
    },
    async (request) => {
      const { caseId } = caseParamsSchema.parse(request.params);
      const input = escalateReviewCaseSchema.parse(request.body);
      const { principal, tenant } = requireRequestContext(request);
      const result = await workflowStore.escalate(tenant.id, principal.userId, caseId, input);
      return toWorkflowResponse(result);
    },
  );

  app.post(
    "/v1/review-cases/:caseId/decision",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:decide") },
    async (request) => {
      const { caseId } = caseParamsSchema.parse(request.params);
      const input = decideReviewCaseSchema.parse(request.body);
      const { principal, tenant } = requireRequestContext(request);
      const result = await workflowStore.decide(tenant.id, principal.userId, caseId, input);
      return toWorkflowResponse(result);
    },
  );

  return app;
}

function publicAttestationCaseFileUrl(origin: string, publicId: string): string {
  return new URL(`/v1/public/attestation-case-files/${publicId}`, origin).toString();
}
