import { createRuntimeApp } from "../src/runtime.js";

const runtime = createRuntimeApp();

export default async function handler(request: unknown, response: unknown) {
  const { app } = await runtime;
  await app.ready();
  app.server.emit("request", request, response);
}
