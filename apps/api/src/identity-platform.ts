import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import { z } from "zod";
import { InvalidAccessTokenError } from "./auth.js";
import type { Environment } from "./config.js";

const identityPlatformClaimsSchema = z.object({
  email: z.email(),
  email_verified: z.literal(true),
  name: z.string().optional(),
  picture: z.url().optional(),
  sub: z.string().min(1),
});

export type VerifiedIdentityPlatformIdentity = {
  avatarUrl: string | null;
  displayName: string | null;
  email: string;
  subject: string;
};

export const requiredIdentityPlatformTokenClaims = ["exp"] as const;

export interface IdentityPlatformTokenVerifier {
  verify(token: string): Promise<VerifiedIdentityPlatformIdentity>;
}

export function createIdentityPlatformTokenVerifier(
  environment: Pick<Environment, "IDENTITY_PLATFORM_PROJECT_ID">,
): IdentityPlatformTokenVerifier {
  const projectId = environment.IDENTITY_PLATFORM_PROJECT_ID;
  const issuer = `https://securetoken.google.com/${projectId}`;
  const keySet = createRemoteJWKSet(
    new URL(
      "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
    ),
  );

  return {
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, keySet, {
          audience: projectId,
          issuer,
          requiredClaims: [...requiredIdentityPlatformTokenClaims],
        });
        const claims = identityPlatformClaimsSchema.parse(payload);

        return {
          avatarUrl: claims.picture ?? null,
          displayName: claims.name ?? null,
          email: claims.email.toLowerCase(),
          subject: claims.sub,
        };
      } catch (error) {
        if (error instanceof errors.JOSEError || error instanceof z.ZodError) {
          throw new InvalidAccessTokenError();
        }

        throw error;
      }
    },
  };
}

export function createApplicationSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function digestApplicationSessionToken(token: string): string {
  return `sha256:${createHash("sha256").update(token).digest("hex")}`;
}
