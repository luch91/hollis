// Vercel traces dependencies from the function entry point. These are required by
// the Hollis database workspace package after the production package is prepared.
import "drizzle-orm/postgres-js";
import "postgres";

import { createRuntimeApp } from "../src/runtime.js";

const runtime = createRuntimeApp();

export default async function handler(request: unknown, response: unknown) {
  const { app } = await runtime;
  await app.ready();
  app.server.emit("request", request, response);
}
