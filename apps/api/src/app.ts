import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify, { LogController } from "fastify";
import {
  type AccessTokenVerifier,
  createWorkOsAccessTokenVerifier,
  InvalidAccessTokenError,
  readBearerToken,
} from "./auth.js";
import type { Environment } from "./config.js";

type AppDependencies = {
  accessTokenVerifier?: AccessTokenVerifier;
};

export async function buildApp(environment: Environment, dependencies: AppDependencies = {}) {
  const accessTokenVerifier =
    dependencies.accessTokenVerifier ?? createWorkOsAccessTokenVerifier(environment);
  const app = Fastify({
    logController: new LogController({ disableRequestLogging: true }),
    logger: environment.NODE_ENV !== "test",
    trustProxy: false,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });
  await app.register(cors, {
    credentials: true,
    methods: ["GET"],
    origin: environment.WEB_ORIGIN,
  });

  app.get("/health/live", async () => ({ status: "ok" }));

  app.get("/v1/session", async (request, reply) => {
    try {
      const token = readBearerToken(request.headers.authorization);
      const principal = await accessTokenVerifier.verify(token);

      return {
        organizationId: principal.organizationId,
        permissions: principal.permissions,
        role: principal.role,
        userId: principal.userId,
      };
    } catch (error) {
      if (error instanceof InvalidAccessTokenError) {
        return reply.code(401).send({ code: "unauthorized", message: "Authentication required." });
      }

      throw error;
    }
  });

  return app;
}
