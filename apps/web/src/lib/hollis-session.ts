import { cookies } from "next/headers";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const cookieName = "hollis_session";

export type HollisSession = {
  activeWorkspace: {
    id: string;
    name: string;
    role: string;
  } | null;
  sessionId: string;
  userId: string;
};

export async function readHollisSession(): Promise<{ session: HollisSession; token: string } | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;

  let response: Response;
  try {
    response = await fetch(`${apiUrl}/v1/auth/me`, {
      cache: "no-store",
      headers: { authorization: `Bearer ${token}` },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return { session: (await response.json()) as HollisSession, token };
}

export async function readHollisSessionToken(): Promise<string | null> {
  return (await cookies()).get(cookieName)?.value ?? null;
}
