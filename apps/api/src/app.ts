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
import { createPostgresReviewIntakeStore, createPostgresTenantResolver } from "./persistence.js";
import { createPostgresReviewWorkflowStore } from "./persistence.js";
import {
  createReviewIntake,
  type ReviewIntakeStore,
  ReviewIntakeConflictError,
  type TenantResolver,
} from "./review-intake.js";
import { createSecurityPreHandler, requireRequestContext, sendSecurityError } from "./security.js";
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
};

export async function buildApp(environment: Environment, dependencies: AppDependencies = {}) {
  const accessTokenVerifier =
    dependencies.accessTokenVerifier ?? createWorkOsAccessTokenVerifier(environment);
  const databaseResource =
    dependencies.reviewIntakeStore && dependencies.tenantResolver && dependencies.workflowStore
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
