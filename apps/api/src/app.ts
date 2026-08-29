import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import {
  createReviewCaseSchema,
  decideReviewCaseSchema,
  escalateReviewCaseSchema,
  reviewCaseStatusSchema,
} from "@hollis/contracts";
import { createDatabase } from "@hollis/database";
import Fastify, { LogController } from "fastify";
import { z } from "zod";
import { type AccessTokenVerifier, createWorkOsAccessTokenVerifier } from "./auth.js";
import type { Environment } from "./config.js";
import { createGoogleCloudEvidenceStorage } from "./evidence-storage.js";
import { evidenceUploadSchema } from "./evidence.js";
import {
  createPostgresEvidenceMetadataStore,
  createPostgresReviewIntakeStore,
  createPostgresTenantResolver,
} from "./persistence.js";
import { createPostgresReviewWorkflowStore } from "./persistence.js";
import {
  createReviewIntake,
  type ReviewIntakeStore,
  ReviewIntakeConflictError,
  type TenantResolver,
} from "./review-intake.js";
import { createSecurityPreHandler, requireRequestContext, sendSecurityError } from "./security.js";
import { InvalidWebhookError, claimsWebhookSchema, verifyClaimsWebhook } from "./webhook.js";
import {
  type ReviewWorkflowStore,
  ReviewCaseNotFoundError,
  ReviewCaseTransitionError,
  toDetailResponse,
  toExportResponse,
  toQueueResponse,
  toWorkflowResponse,
} from "./workflow.js";

type AppDependencies = {
  accessTokenVerifier?: AccessTokenVerifier;
  reviewIntakeStore?: ReviewIntakeStore;
  tenantResolver?: TenantResolver;
  workflowStore?: ReviewWorkflowStore;
  evidenceStorage?: ReturnType<typeof createGoogleCloudEvidenceStorage>;
  evidenceMetadataStore?: import("./evidence.js").EvidenceMetadataStore;
};

export async function buildApp(environment: Environment, dependencies: AppDependencies = {}) {
  const accessTokenVerifier =
    dependencies.accessTokenVerifier ?? createWorkOsAccessTokenVerifier(environment);
  const databaseResource =
    dependencies.reviewIntakeStore &&
    dependencies.tenantResolver &&
    dependencies.workflowStore &&
    dependencies.evidenceMetadataStore
      ? null
      : createDatabase(environment.DATABASE_URL);

  function requireDatabase() {
    if (!databaseResource) {
      throw new Error("Database dependencies are incomplete.");
    }

    return databaseResource.database;
  }

  const reviewIntakeStore =
    dependencies.reviewIntakeStore ?? createPostgresReviewIntakeStore(requireDatabase());
  const tenantResolver =
    dependencies.tenantResolver ?? createPostgresTenantResolver(requireDatabase());
  const workflowStore =
    dependencies.workflowStore ?? createPostgresReviewWorkflowStore(requireDatabase());
  const evidenceMetadataStore =
    dependencies.evidenceMetadataStore ?? createPostgresEvidenceMetadataStore(requireDatabase());
  const evidenceStorage =
    dependencies.evidenceStorage ??
    (environment.GCS_BUCKET
      ? createGoogleCloudEvidenceStorage(environment.GCS_PROJECT_ID, environment.GCS_BUCKET)
      : null);
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
    methods: ["GET", "POST"],
    origin: environment.WEB_ORIGIN,
  });

  app.decorateRequest("principal", null);
  app.decorateRequest("tenant", null);

  if (databaseResource) {
    app.addHook("onClose", async () => databaseResource.client.end());
  }

  app.setErrorHandler((error, _request, reply) => {
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

    app.log.error({ errorName: error instanceof Error ? error.name : "unknown" }, "request failed");
    return reply.code(500).send({ code: "internal_error", message: "Request failed." });
  });

  app.get("/health/live", async () => ({ status: "ok" }));

  app.post("/v1/webhooks/claims", async (request, reply) => {
    if (!environment.CLAIMS_WEBHOOK_SECRET) {
      throw new InvalidWebhookError();
    }

    const payload = claimsWebhookSchema.parse(request.body);
    const verified = verifyClaimsWebhook(
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
    const tenant = await tenantResolver.findByOrganizationId(verified.organizationId);
    if (!tenant) {
      throw new InvalidWebhookError();
    }
    const { organizationId: _organizationId, ...intake } = verified;
    const reviewCase = await createReviewIntake(
      intake,
      { actorId: "claims-system", tenantId: tenant.id },
      reviewIntakeStore,
    );

    return reply.code(reviewCase.replayed ? 200 : 201).send(reviewCase);
  });

  app.get(
    "/v1/session",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver) },
    async (request) => {
      const { principal, tenant } = requireRequestContext(request);
      return {
        organizationId: principal.organizationId,
        permissions: principal.permissions,
        role: principal.role,
        tenantId: tenant.id,
        userId: principal.userId,
      };
    },
  );

  app.post(
    "/v1/review-cases",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:create") },
    async (request, reply) => {
      const input = createReviewCaseSchema.parse(request.body);
      const { principal, tenant } = requireRequestContext(request);
      const reviewCase = await createReviewIntake(
        input,
        { actorId: principal.userId, tenantId: tenant.id },
        reviewIntakeStore,
      );

      return reply.code(reviewCase.replayed ? 200 : 201).send(reviewCase);
    },
  );

  const caseParamsSchema = z.object({ caseId: z.uuid() }).strict();
  const evidenceParamsSchema = z.object({ caseId: z.uuid(), evidenceId: z.uuid() }).strict();

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
    "/v1/review-cases/:caseId/evidence/uploads",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:create") },
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
      const { tenant } = requireRequestContext(request);
      const reviewCase = await workflowStore.get(tenant.id, caseId);
      if (!reviewCase) {
        throw new ReviewCaseNotFoundError();
      }

      return toDetailResponse(reviewCase);
    },
  );

  app.get(
    "/v1/review-cases/:caseId/export",
    { preHandler: createSecurityPreHandler(accessTokenVerifier, tenantResolver, "reviews:read") },
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
