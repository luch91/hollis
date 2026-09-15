import { createRuntimeApp } from "./runtime.js";

const { app, environment } = await createRuntimeApp();

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutdown requested");
  await app.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host: environment.API_HOST, port: environment.API_PORT });
