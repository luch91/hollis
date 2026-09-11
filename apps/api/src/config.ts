import type { DatabaseConnectionOptions } from "@hollis/database";
import { z } from "zod";

const databaseConfigurationSchema = z
  .object({
    DATABASE_URL: z.url().optional(),
    DB_NAME: z.string().min(1).optional(),
    DB_PASS: z.string().min(1).optional(),
    DB_USER: z.string().min(1).optional(),
    INSTANCE_UNIX_SOCKET: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    const structuredValues = [
      value.DB_NAME,
      value.DB_PASS,
      value.DB_USER,
      value.INSTANCE_UNIX_SOCKET,
    ];
    const hasStructuredValue = structuredValues.some((item) => item !== undefined);
    const hasCompleteStructuredConfiguration = structuredValues.every((item) => item !== undefined);

    if (value.DATABASE_URL && hasStructuredValue) {
      context.addIssue({
        code: "custom",
        message: "Set DATABASE_URL or the structured Cloud SQL settings, not both.",
        path: ["DATABASE_URL"],
      });
    }

    if (!value.DATABASE_URL && !hasCompleteStructuredConfiguration) {
      context.addIssue({
        code: "custom",
        message: "Set DATABASE_URL or all of DB_NAME, DB_PASS, DB_USER, and INSTANCE_UNIX_SOCKET.",
        path: ["DATABASE_URL"],
      });
    }
  });

type DatabaseConfiguration = z.infer<typeof databaseConfigurationSchema>;

const environmentSchema = z
  .object({
    API_HOST: z.string().default("0.0.0.0"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    AWS_REGION: z.string().min(3).optional(),
    CLAIMS_WEBHOOK_SECRET: z.string().min(32).optional(),
    GCS_BUCKET: z.string().min(3).optional(),
    GCS_PROJECT_ID: z.string().min(1).default("hollis-507001"),
    S3_BUCKET: z.string().min(3).optional(),
    GENLAYER_STUDIO_CONTRACT_ADDRESS: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/)
      .optional(),
    PUBLIC_ATTESTATION_ORIGIN: z
      .url()
      .refine((value) => new URL(value).protocol === "https:", {
        message: "PUBLIC_ATTESTATION_ORIGIN must use HTTPS.",
      })
      .optional(),
    RESEND_API_KEY: z.string().min(10).optional(),
    RESEND_FROM: z.string().trim().min(3).max(320).optional(),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    WEB_ORIGIN: z.url().default("http://localhost:3000"),
    HOLLIS_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24).default(8),
    IDENTITY_PLATFORM_PROJECT_ID: z.string().min(1).default("hollis-507001"),
  })
  .and(databaseConfigurationSchema)
  .superRefine((value, context) => {
    if (value.GCS_BUCKET && value.S3_BUCKET) {
      context.addIssue({
        code: "custom",
        message: "Set GCS_BUCKET or S3_BUCKET, not both.",
        path: ["S3_BUCKET"],
      });
    }

    if (value.S3_BUCKET && !value.AWS_REGION) {
      context.addIssue({
        code: "custom",
        message: "AWS_REGION is required when S3_BUCKET is configured.",
        path: ["AWS_REGION"],
      });
    }

    if (value.RESEND_API_KEY && !value.RESEND_FROM) {
      context.addIssue({
        code: "custom",
        message: "RESEND_FROM is required when RESEND_API_KEY is configured.",
        path: ["RESEND_FROM"],
      });
    }

    if (value.RESEND_FROM && !value.RESEND_API_KEY) {
      context.addIssue({
        code: "custom",
        message: "RESEND_API_KEY is required when RESEND_FROM is configured.",
        path: ["RESEND_API_KEY"],
      });
    }

    if (value.NODE_ENV !== "production") return;

    if (!value.CLAIMS_WEBHOOK_SECRET) {
      context.addIssue({
        code: "custom",
        message: "CLAIMS_WEBHOOK_SECRET is required in production.",
        path: ["CLAIMS_WEBHOOK_SECRET"],
      });
    }

    if (!value.GCS_BUCKET && !value.S3_BUCKET) {
      context.addIssue({
        code: "custom",
        message: "GCS_BUCKET or S3_BUCKET is required in production.",
        path: ["S3_BUCKET"],
      });
    }

    if (new URL(value.WEB_ORIGIN).protocol !== "https:") {
      context.addIssue({
        code: "custom",
        message: "WEB_ORIGIN must use HTTPS in production.",
        path: ["WEB_ORIGIN"],
      });
    }

    if (value.API_HOST !== "0.0.0.0") {
      context.addIssue({
        code: "custom",
        message: "API_HOST must be 0.0.0.0 in production.",
        path: ["API_HOST"],
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function readEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  return environmentSchema.parse({
    ...source,
    API_PORT: source.API_PORT ?? source.PORT ?? "4000",
  });
}

export function databaseConnectionFromEnvironment(
  environment: DatabaseConfiguration,
): string | DatabaseConnectionOptions {
  if (environment.DATABASE_URL) return environment.DATABASE_URL;

  if (
    !environment.DB_NAME ||
    !environment.DB_PASS ||
    !environment.DB_USER ||
    !environment.INSTANCE_UNIX_SOCKET
  ) {
    throw new Error("Database configuration is incomplete.");
  }

  return {
    database: environment.DB_NAME,
    host: environment.INSTANCE_UNIX_SOCKET,
    password: environment.DB_PASS,
    username: environment.DB_USER,
  };
}

export function readDatabaseConnection(
  source: NodeJS.ProcessEnv = process.env,
): string | DatabaseConnectionOptions {
  return databaseConnectionFromEnvironment(databaseConfigurationSchema.parse(source));
}
