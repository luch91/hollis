import { z } from "zod";

const environmentSchema = z
  .object({
    API_HOST: z.string().default("0.0.0.0"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    CLAIMS_WEBHOOK_SECRET: z.string().min(32).optional(),
    GCS_BUCKET: z.string().min(3).optional(),
    GCS_PROJECT_ID: z.string().min(1).default("hollis-507001"),
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
    DATABASE_URL: z.url(),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    WEB_ORIGIN: z.url().default("http://localhost:3000"),
    WORKOS_CLIENT_ID: z.string().min(1),
    WORKOS_ISSUER: z.url(),
    WORKOS_JWKS_URL: z.url(),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV !== "production") return;

    if (!value.CLAIMS_WEBHOOK_SECRET) {
      context.addIssue({
        code: "custom",
        message: "CLAIMS_WEBHOOK_SECRET is required in production.",
        path: ["CLAIMS_WEBHOOK_SECRET"],
      });
    }

    if (!value.GCS_BUCKET) {
      context.addIssue({
        code: "custom",
        message: "GCS_BUCKET is required in production.",
        path: ["GCS_BUCKET"],
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
