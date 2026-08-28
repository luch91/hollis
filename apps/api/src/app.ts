import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { createReviewCaseSchema } from "@hollis/contracts";
import { createDatabase } from "@hollis/database";
import Fastify, { LogController } from "fastify";
import { z } from "zod";
import { type AccessTokenVerifier, createWorkOsAccessTokenVerifier } from "./auth.js";
import type { Environment } from "./config.js";
import { createPostgresReviewIntakeStore, createPostgresTenantResolver } from "./persistence.js";
import {
  createReviewIntake,
  type ReviewIntakeStore,
  ReviewIntakeConflictError,
  type TenantResolver,
} from "./review-intake.js";
import { createSecurityPreHandler, requireRequestContext, sendSecurityError } from "./security.js";

type AppDependencies = {
  accessTokenVerifier?: AccessTokenVerifier;
  reviewIntakeStore?: ReviewIntakeStore;
  tenantResolver?: TenantResolver;
};

export async function buildApp(environment: Environment, dependencies: AppDependencies = {}) {
  const accessTokenVerifier =
    dependencies.accessTokenVerifier ?? createWorkOsAccessTokenVerifier(environment);
  const databaseResource =
    dependencies.reviewIntakeStore && dependencies.tenantResolver
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

    if (error instanceof z.ZodError) {
      return reply
        .code(400)
        .send({ code: "invalid_request", message: "Request validation failed." });
    }

    app.log.error({ err: error }, "request failed");
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

  return app;
}
