import { createHash } from "node:crypto";
import { z } from "zod";

const supportedAvatarMediaTypes = ["image/jpeg", "image/png", "image/webp"] as const;
const maximumAvatarBytes = 192 * 1024;

export type ProfileAvatarMediaType = (typeof supportedAvatarMediaTypes)[number];

export const updateUserProfileSchema = z
  .object({
    bio: z.string().trim().max(500).optional().default(""),
    displayName: z.string().trim().min(2).max(120),
    jobTitle: z.string().trim().max(120).optional().default(""),
    timeZone: z
      .string()
      .trim()
      .max(100)
      .refine((value) => {
        if (!value) return true;
        try {
          Intl.DateTimeFormat(undefined, { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, "Time zone must be a valid IANA time-zone name.")
      .optional()
      .default(""),
  })
  .strict();

export class ProfileAvatarError extends Error {
  constructor(readonly code: "avatar_invalid" | "avatar_too_large" | "avatar_unsupported") {
    super(code);
    this.name = "ProfileAvatarError";
  }
}

export function serializeProfileTimestamp(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const timestamp = value instanceof Date ? value : new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

export function createProfileAvatar(
  tenantId: string,
  userId: string,
  content: Buffer,
  mediaType: string,
) {
  if (!supportedAvatarMediaTypes.includes(mediaType as ProfileAvatarMediaType)) {
    throw new ProfileAvatarError("avatar_unsupported");
  }
  if (!content.byteLength) throw new ProfileAvatarError("avatar_invalid");
  if (content.byteLength > maximumAvatarBytes) throw new ProfileAvatarError("avatar_too_large");

  const detected = detectMediaType(content);
  if (!detected || detected !== mediaType) throw new ProfileAvatarError("avatar_invalid");
  const digest = `sha256:${createHash("sha256").update(content).digest("hex")}`;
  return {
    digest,
    mediaType: detected,
    objectName: `tenants/${tenantId}/user-profiles/${userId}/${digest.slice("sha256:".length)}`,
  };
}

function detectMediaType(content: Buffer): ProfileAvatarMediaType | null {
  if (
    content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (content.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (
    content.subarray(0, 4).toString("ascii") === "RIFF" &&
    content.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}
