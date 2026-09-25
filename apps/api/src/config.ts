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
    AZURE_STORAGE_ACCOUNT_NAME: z
      .string()
      .regex(/^[a-z0-9]{3,24}$/)
      .optional(),
    AZURE_STORAGE_CONTAINER: z
      .string()
      .regex(/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/)
      .optional(),
    CLAIMS_WEBHOOK_SECRET: z.string().min(32).optional(),
    AUDIT_CHECKPOINT_KEY_ID: z.string().trim().min(1).max(128).optional(),
    AUDIT_CHECKPOINT_PRIVATE_KEY_BASE64: z.string().min(32).optional(),
    AUDIT_CHECKPOINT_PUBLIC_KEY_BASE64: z.string().min(32).optional(),
    GCS_BUCKET: z.string().min(3).optional(),
    GCS_PROJECT_ID: z.string().min(1).default("hollis-507001"),
    EVIDENCE_STORAGE_ENCRYPTION: z.enum(["provider_managed", "customer_managed"]).optional(),
    EVIDENCE_STORAGE_JURISDICTION: z.enum(["us", "eu", "global"]).optional(),
    EVIDENCE_STORAGE_PRIVATE: z.enum(["true"]).optional(),
    EVIDENCE_STORAGE_VERSIONING: z.enum(["true"]).optional(),
    EVIDENCE_RETENTION_DAYS: z.coerce.number().int().min(1).max(36_500).optional(),
    CRON_SECRET: z.string().min(32).optional(),
    R2_ACCESS_KEY_ID: z.string().min(1).optional(),
    R2_ACCOUNT_ID: z.string().min(1).optional(),
    R2_BUCKET: z.string().min(3).optional(),
    R2_JURISDICTION: z.enum(["default", "eu"]).optional(),
    R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    S3_BUCKET: z.string().min(3).optional(),
    GENLAYER_STUDIO_CONTRACT_ADDRESS: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/)
      .optional(),
    GENLAYER_CHAIN_ID: z.coerce.number().int().optional(),
    GENLAYER_NETWORK: z.string().optional(),
    GENLAYER_RPC_URL: z.url().optional(),
    GENLAYER_RUNTIME_ADDRESS: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/)
      .optional(),
    GENLAYER_RUNTIME_PRIVATE_KEY: z
      .string()
      .regex(/^0x[a-fA-F0-9]{64}$/)
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
    const auditCheckpointValues = [
      value.AUDIT_CHECKPOINT_KEY_ID,
      value.AUDIT_CHECKPOINT_PRIVATE_KEY_BASE64,
      value.AUDIT_CHECKPOINT_PUBLIC_KEY_BASE64,
    ];
    if (
      auditCheckpointValues.some((item) => item !== undefined) &&
      !auditCheckpointValues.every((item) => item !== undefined)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "AUDIT_CHECKPOINT_KEY_ID, AUDIT_CHECKPOINT_PRIVATE_KEY_BASE64, and AUDIT_CHECKPOINT_PUBLIC_KEY_BASE64 must be set together.",
        path: ["AUDIT_CHECKPOINT_PRIVATE_KEY_BASE64"],
      });
    }
    const evidenceStoreCount = [
      value.GCS_BUCKET,
      value.R2_BUCKET,
      value.S3_BUCKET,
      value.AZURE_STORAGE_ACCOUNT_NAME && value.AZURE_STORAGE_CONTAINER,
    ].filter(Boolean).length;

    if (evidenceStoreCount > 1) {
      context.addIssue({
        code: "custom",
        message: "Configure exactly one evidence storage provider.",
        path: ["AZURE_STORAGE_ACCOUNT_NAME"],
      });
    }

    if (value.S3_BUCKET && !value.AWS_REGION) {
      context.addIssue({
        code: "custom",
        message: "AWS_REGION is required when S3_BUCKET is configured.",
        path: ["AWS_REGION"],
      });
    }

    const r2Values = [
      value.R2_ACCOUNT_ID,
      value.R2_BUCKET,
      value.R2_ACCESS_KEY_ID,
      value.R2_SECRET_ACCESS_KEY,
    ];
    const hasR2Value = r2Values.some((item) => item !== undefined);
    const hasCompleteR2Configuration = r2Values.every((item) => item !== undefined);
    if (hasR2Value && !hasCompleteR2Configuration) {
      context.addIssue({
        code: "custom",
        message:
          "R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY must be set together.",
        path: ["R2_BUCKET"],
      });
    }

    if (Boolean(value.AZURE_STORAGE_ACCOUNT_NAME) !== Boolean(value.AZURE_STORAGE_CONTAINER)) {
      context.addIssue({
        code: "custom",
        message: "AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_CONTAINER must be set together.",
        path: ["AZURE_STORAGE_CONTAINER"],
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

    const genLayerRuntimeValues = [
      value.GENLAYER_CHAIN_ID,
      value.GENLAYER_NETWORK,
      value.GENLAYER_RPC_URL,
      value.GENLAYER_RUNTIME_ADDRESS,
      value.GENLAYER_RUNTIME_PRIVATE_KEY,
    ];
    const hasGenLayerRuntimeValue = genLayerRuntimeValues.some((item) => item !== undefined);
    const hasCompleteGenLayerRuntime = genLayerRuntimeValues.every((item) => item !== undefined);
    if (hasGenLayerRuntimeValue && !hasCompleteGenLayerRuntime) {
      context.addIssue({
        code: "custom",
        message: "The GenLayer runtime configuration must be set as one complete group.",
        path: ["GENLAYER_RUNTIME_ADDRESS"],
      });
    }
    if (hasCompleteGenLayerRuntime) {
      if (value.GENLAYER_NETWORK !== "studio-next") {
        context.addIssue({
          code: "custom",
          message: "GENLAYER_NETWORK must be studio-next.",
          path: ["GENLAYER_NETWORK"],
        });
      }
      if (value.GENLAYER_CHAIN_ID !== 61997) {
        context.addIssue({
          code: "custom",
          message: "GENLAYER_CHAIN_ID must be 61997 for Studio Next.",
          path: ["GENLAYER_CHAIN_ID"],
        });
      }
      if (value.GENLAYER_RPC_URL !== "https://studio-next.genlayer.com/api") {
        context.addIssue({
          code: "custom",
          message: "GENLAYER_RPC_URL must use the approved Studio Next endpoint.",
          path: ["GENLAYER_RPC_URL"],
        });
      }
    }

    if (value.NODE_ENV !== "production") return;

    if (!value.CLAIMS_WEBHOOK_SECRET) {
      context.addIssue({
        code: "custom",
        message: "CLAIMS_WEBHOOK_SECRET is required in production.",
        path: ["CLAIMS_WEBHOOK_SECRET"],
      });
    }

    if (evidenceStoreCount === 1) {
      for (const capability of [
        "EVIDENCE_STORAGE_PRIVATE",
        "EVIDENCE_STORAGE_ENCRYPTION",
        "EVIDENCE_STORAGE_VERSIONING",
        "EVIDENCE_STORAGE_JURISDICTION",
      ] as const) {
        if (!value[capability]) {
          context.addIssue({
            code: "custom",
            message: `${capability} is required when evidence storage is configured in production.`,
            path: [capability],
          });
        }
      }
      if (value.EVIDENCE_RETENTION_DAYS === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "EVIDENCE_RETENTION_DAYS is required when evidence storage is configured in production.",
          path: ["EVIDENCE_RETENTION_DAYS"],
        });
      }
    }

    if (
      !value.GCS_BUCKET &&
      !value.R2_BUCKET &&
      !value.S3_BUCKET &&
      !value.AZURE_STORAGE_ACCOUNT_NAME
    ) {
      context.addIssue({
        code: "custom",
        message: "An evidence storage provider is required in production.",
        path: ["AZURE_STORAGE_ACCOUNT_NAME"],
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
