import { describe, expect, it } from "vitest";
import {
  databaseConnectionFromEnvironment,
  readDatabaseConnection,
  readEnvironment,
} from "./config.js";

const baseEnvironment = {
  DATABASE_URL: "postgres://hollis_app:hollis_app@localhost:5434/hollis",
  NODE_ENV: "test",
  WEB_ORIGIN: "http://localhost:3000",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_ISSUER: "https://api.workos.com",
  WORKOS_JWKS_URL: "https://api.workos.com/sso/jwks/client_test",
};

describe("readEnvironment", () => {
  it("uses the platform PORT value when API_PORT is absent", () => {
    expect(readEnvironment({ ...baseEnvironment, PORT: "8080" }).API_PORT).toBe(8080);
  });

  it("requires the production evidence and HTTPS boundary settings", () => {
    const result = readEnvironment.bind(null, {
      ...baseEnvironment,
      API_HOST: "127.0.0.1",
      NODE_ENV: "production",
      WEB_ORIGIN: "http://console.hollis.test",
    });

    expect(result).toThrow(/CLAIMS_WEBHOOK_SECRET|required in production|HTTPS|0\.0\.0\.0/);
  });

  it("accepts a complete Cloud Run production configuration", () => {
    expect(
      readEnvironment({
        ...baseEnvironment,
        CLAIMS_WEBHOOK_SECRET: "a".repeat(32),
        GCS_BUCKET: "hollis-evidence-429498177112",
        NODE_ENV: "production",
        PORT: "8080",
        WEB_ORIGIN: "https://console.hollis.test",
      }),
    ).toMatchObject({ API_HOST: "0.0.0.0", API_PORT: 8080 });
  });

  it("uses the Cloud SQL Unix socket settings without a composed database URL", () => {
    const environment = readEnvironment({
      ...baseEnvironment,
      DATABASE_URL: undefined,
      DB_NAME: "hollis",
      DB_PASS: "runtime-password",
      DB_USER: "hollis_app",
      INSTANCE_UNIX_SOCKET: "/cloudsql/hollis-507001:europe-west1:hollis-postgres",
    });

    expect(databaseConnectionFromEnvironment(environment)).toEqual({
      database: "hollis",
      host: "/cloudsql/hollis-507001:europe-west1:hollis-postgres",
      password: "runtime-password",
      username: "hollis_app",
    });
  });

  it("rejects mixed database configuration", () => {
    expect(() =>
      readDatabaseConnection({
        DATABASE_URL: "postgres://hollis_app:hollis_app@localhost:5434/hollis",
        DB_NAME: "hollis",
      }),
    ).toThrow(/not both/);
  });
});
