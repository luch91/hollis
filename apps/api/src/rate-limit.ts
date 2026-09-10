import { createHash } from "node:crypto";
import type { FastifyRequest, preHandlerHookHandler } from "fastify";

export type RateLimitPolicy = {
  maxRequests: number;
  windowMs: number;
};

export class RateLimitExceededError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Rate limit exceeded.");
    this.name = "RateLimitExceededError";
  }
}

export interface RateLimiter {
  consume(scope: string, subject: string, policy: RateLimitPolicy, now?: number): void;
}

export function createInMemoryRateLimiter(): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();

  return {
    consume(scope, subject, policy, now = Date.now()) {
      const key = `${scope}:${subject}`;
      const existing = windows.get(key);
      const window =
        !existing || now >= existing.resetAt
          ? { count: 0, resetAt: now + policy.windowMs }
          : existing;

      if (window.count >= policy.maxRequests) {
        throw new RateLimitExceededError(Math.max(1, Math.ceil((window.resetAt - now) / 1000)));
      }

      window.count += 1;
      windows.set(key, window);
    },
  };
}

export function requestRateLimitSubject(request: FastifyRequest): string {
  const authorization = request.headers.authorization;
  const material = authorization ? `authorization:${authorization}` : `ip:${request.ip}`;
  return createHash("sha256").update(material).digest("hex");
}

export function createRateLimitPreHandler(
  limiter: RateLimiter,
  scope: string,
  policy: RateLimitPolicy,
): preHandlerHookHandler {
  return async function enforceRateLimit(request, reply) {
    try {
      limiter.consume(scope, requestRateLimitSubject(request), policy);
    } catch (error) {
      if (!(error instanceof RateLimitExceededError)) throw error;
      return reply
        .header("retry-after", String(error.retryAfterSeconds))
        .code(429)
        .send({ code: "rate_limited", message: "Too many requests. Try again later." });
    }
  };
}
