import { describe, expect, it } from "vitest";
import {
  databaseConnectionFromEnvironment,
  readDatabaseConnection,
  readEnvironment,
} from "./config.js";

const baseEnvironment = {
  DATABASE_URL: "postgres://hollis_app:hollis_app@localhost:5434/hollis",
  EVIDENCE_STORAGE_ENCRYPTION: "provider_managed",
  EVIDENCE_STORAGE_JURISDICTION: "eu",
  EVIDENCE_STORAGE_PRIVATE: "true",
  EVIDENCE_STORAGE_VERSIONING: "true",
  IDENTITY_PLATFORM_PROJECT_ID: "hollis-507001",
  NODE_ENV: "test",
  WEB_ORIGIN: "http://localhost:3000",
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

  it("accepts a complete AWS production configuration", () => {
    expect(
      readEnvironment({
        ...baseEnvironment,
        AWS_REGION: "eu-west-1",
        CLAIMS_WEBHOOK_SECRET: "a".repeat(32),
        NODE_ENV: "production",
        S3_BUCKET: "hollis-evidence-280517746304",
        WEB_ORIGIN: "https://thehollis.xyz",
      }),
    ).toMatchObject({ AWS_REGION: "eu-west-1", S3_BUCKET: "hollis-evidence-280517746304" });
  });

  it("accepts only a complete R2 production configuration", () => {
    expect(
      readEnvironment({
        ...baseEnvironment,
        CLAIMS_WEBHOOK_SECRET: "a".repeat(32),
        NODE_ENV: "production",
        R2_ACCESS_KEY_ID: "r2-access-key",
        R2_ACCOUNT_ID: "account-id",
        R2_BUCKET: "hollis-evidence",
        R2_JURISDICTION: "eu",
        R2_SECRET_ACCESS_KEY: "r2-secret-key",
        WEB_ORIGIN: "https://thehollis.xyz",
      }),
    ).toMatchObject({ R2_BUCKET: "hollis-evidence", R2_JURISDICTION: "eu" });
    expect(() => readEnvironment({ ...baseEnvironment, R2_BUCKET: "hollis-evidence" })).toThrow(
      /R2_ACCOUNT_ID/,
    );
  });

  it("accepts a complete Azure Blob Storage production configuration", () => {
    expect(
      readEnvironment({
        ...baseEnvironment,
        AZURE_STORAGE_ACCOUNT_NAME: "hollisevidencedemo",
        AZURE_STORAGE_CONTAINER: "evidence",
        CLAIMS_WEBHOOK_SECRET: "a".repeat(32),
        NODE_ENV: "production",
        WEB_ORIGIN: "https://thehollis.xyz",
      }),
    ).toMatchObject({
      AZURE_STORAGE_ACCOUNT_NAME: "hollisevidencedemo",
      AZURE_STORAGE_CONTAINER: "evidence",
    });
  });

  it("rejects ambiguous evidence storage configuration", () => {
    expect(() =>
      readEnvironment({
        ...baseEnvironment,
        AWS_REGION: "eu-west-1",
        GCS_BUCKET: "hollis-evidence-429498177112",
        R2_ACCESS_KEY_ID: "r2-access-key",
        R2_ACCOUNT_ID: "account-id",
        R2_BUCKET: "hollis-evidence",
        R2_SECRET_ACCESS_KEY: "r2-secret-key",
        S3_BUCKET: "hollis-evidence-280517746304",
      }),
    ).toThrow(/exactly one evidence storage provider/);
  });

  it("requires a region for S3 evidence storage", () => {
    expect(() =>
      readEnvironment({
        ...baseEnvironment,
        S3_BUCKET: "hollis-evidence-280517746304",
      }),
    ).toThrow(/AWS_REGION/);
  });

  it("requires both Azure Blob Storage settings", () => {
    expect(() =>
      readEnvironment({ ...baseEnvironment, AZURE_STORAGE_ACCOUNT_NAME: "hollisevidencedemo" }),
    ).toThrow(/must be set together/);
  });

  it("requires both Resend server settings before transactional email is enabled", () => {
    expect(() =>
      readEnvironment({
        ...baseEnvironment,
        RESEND_API_KEY: "re_test_key_value",
      }),
    ).toThrow(/RESEND_FROM/);
    expect(() =>
      readEnvironment({
        ...baseEnvironment,
        RESEND_FROM: "Hollis <hello@mail.thehollis.xyz>",
      }),
    ).toThrow(/RESEND_API_KEY/);
    expect(
      readEnvironment({
        ...baseEnvironment,
        RESEND_API_KEY: "re_test_key_value",
        RESEND_FROM: "Hollis <hello@mail.thehollis.xyz>",
      }),
    ).toMatchObject({ RESEND_FROM: "Hollis <hello@mail.thehollis.xyz>" });
  });

  it("accepts only a complete approved Studio Next runtime configuration", () => {
    const runtime = {
      GENLAYER_CHAIN_ID: "61997",
      GENLAYER_NETWORK: "studio-next",
      GENLAYER_RPC_URL: "https://studio-next.genlayer.com/api",
      GENLAYER_RUNTIME_ADDRESS: `0x${"1".repeat(40)}`,
      GENLAYER_RUNTIME_PRIVATE_KEY: `0x${"2".repeat(64)}`,
    };
    expect(readEnvironment({ ...baseEnvironment, ...runtime })).toMatchObject({
      GENLAYER_CHAIN_ID: 61997,
      GENLAYER_NETWORK: "studio-next",
    });
    expect(() =>
      readEnvironment({
        ...baseEnvironment,
        GENLAYER_RUNTIME_ADDRESS: runtime.GENLAYER_RUNTIME_ADDRESS,
      }),
    ).toThrow(/complete group/);
    expect(() =>
      readEnvironment({
        ...baseEnvironment,
        ...runtime,
        GENLAYER_CHAIN_ID: "61999",
      }),
    ).toThrow(/61997/);
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
