import { z } from "zod";

const environmentSchema = z
  .object({
    API_HOST: z.string().default("127.0.0.1"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    CLAIMS_WEBHOOK_SECRET: z.string().min(32).optional(),
    GCS_BUCKET: z.string().min(3).optional(),
    GCS_PROJECT_ID: z.string().min(1).default("hollis-507001"),
    GENLAYER_STUDIO_CONTRACT_ADDRESS: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/)
      .optional(),
    DATABASE_URL: z.url(),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    WEB_ORIGIN: z.url().default("http://localhost:3000"),
    WORKOS_CLIENT_ID: z.string().min(1),
    WORKOS_ISSUER: z.url(),
    WORKOS_JWKS_URL: z.url(),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === "production" && !value.CLAIMS_WEBHOOK_SECRET) {
      context.addIssue({
        code: "custom",
        message: "CLAIMS_WEBHOOK_SECRET is required in production.",
        path: ["CLAIMS_WEBHOOK_SECRET"],
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function readEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  return environmentSchema.parse(source);
}
