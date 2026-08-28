import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify, { LogController } from "fastify";
import type { Environment } from "./config.js";

export async function buildApp(environment: Environment) {
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

  return app;
}
