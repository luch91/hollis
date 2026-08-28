import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("health endpoint", () => {
  it("reports that the process is live", async () => {
    const app = await buildApp({
      API_HOST: "127.0.0.1",
      API_PORT: 4000,
      NODE_ENV: "test",
      WEB_ORIGIN: "http://localhost:3000",
    });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});
