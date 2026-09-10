import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

export const workspaceRoleSchema = z.enum(["administrator", "reviewer", "contributor", "auditor"]);
const websiteSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }, "Website must be an HTTP or HTTPS URL.");
export const workspaceProfileSchema = z
  .object({
    industry: z.string().trim().max(120).optional().default(""),
    name: z.string().trim().min(2).max(120),
    operatingRegion: z.string().trim().max(120).optional().default(""),
    website: websiteSchema.optional().default(""),
  })
  .strict();
export const createInvitationSchema = z
  .object({
    email: z.string().trim().email().max(320),
    role: workspaceRoleSchema,
  })
  .strict();
export const changeMemberRoleSchema = z.object({ role: workspaceRoleSchema }).strict();
export const acceptInvitationSchema = z
  .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();

export function createInvitationToken() {
  return randomBytes(32).toString("base64url");
}
export function digestInvitationToken(token: string) {
  return `sha256:${createHash("sha256").update(token).digest("hex")}`;
}
