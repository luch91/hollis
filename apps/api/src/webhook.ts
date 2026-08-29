import { createHmac, timingSafeEqual } from "node:crypto";
import { createReviewCaseSchema, type CreateReviewCase } from "@hollis/contracts";
import { z } from "zod";

export const claimsWebhookSchema = createReviewCaseSchema
  .extend({ organizationId: z.string().min(1).max(128) })
  .strict();
export type ClaimsWebhook = z.infer<typeof claimsWebhookSchema>;

export class InvalidWebhookError extends Error {
  constructor() {
    super("The claims webhook signature or replay window is invalid.");
    this.name = "InvalidWebhookError";
  }
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function verifyClaimsWebhook(
  payload: ClaimsWebhook,
  headers: { idempotencyKey?: string; signature?: string; timestamp?: string },
  secret: string,
  now = Date.now(),
  toleranceSeconds = 300,
): CreateReviewCase & { organizationId: string } {
  const timestamp = Number(headers.timestamp);
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(now - timestamp * 1000) > toleranceSeconds * 1000
  ) {
    throw new InvalidWebhookError();
  }
  if (!headers.idempotencyKey || headers.idempotencyKey !== payload.externalReference) {
    throw new InvalidWebhookError();
  }

  const supplied = headers.signature?.startsWith("sha256=")
    ? headers.signature.slice("sha256=".length)
    : "";
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${canonicalize(payload)}`)
    .digest("hex");
  const suppliedBytes = Buffer.from(supplied, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  if (
    suppliedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(suppliedBytes, expectedBytes)
  ) {
    throw new InvalidWebhookError();
  }

  return payload;
}

export function signClaimsWebhook(
  payload: ClaimsWebhook,
  timestamp: number,
  secret: string,
): string {
  return `sha256=${createHmac("sha256", secret)
    .update(`${timestamp}.${canonicalize(payload)}`)
    .digest("hex")}`;
}
