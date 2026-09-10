export class SessionRevocationUnavailableError extends Error {
  constructor() {
    super("Session revocation could not be confirmed.");
    this.name = "SessionRevocationUnavailableError";
  }
}

export async function revokeHollisSession(
  apiUrl: string,
  token: string | null,
  fetchImplementation: typeof fetch = fetch,
): Promise<void> {
  if (!token) return;

  let response: Response;
  try {
    response = await fetchImplementation(`${apiUrl}/v1/auth/sessions/current`, {
      cache: "no-store",
      headers: { authorization: `Bearer ${token}` },
      method: "DELETE",
    });
  } catch {
    throw new SessionRevocationUnavailableError();
  }

  if (!response.ok && response.status !== 401) {
    throw new SessionRevocationUnavailableError();
  }
}
