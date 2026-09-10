export function sessionCookieMaxAgeSeconds(expiresAt: string, now = Date.now()): number {
  const expiresAtMilliseconds = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMilliseconds) || expiresAtMilliseconds <= now) {
    throw new Error("The application session expiry is invalid.");
  }

  return Math.max(1, Math.floor((expiresAtMilliseconds - now) / 1000));
}
