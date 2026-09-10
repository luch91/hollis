import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sessionCookieMaxAgeSeconds } from "@/lib/hollis-session-cookie";
import {
  revokeHollisSession,
  SessionRevocationUnavailableError,
} from "@/lib/hollis-session-revocation";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const cookieName = "hollis_session";

export async function POST(request: Request) {
  const body = (await request.json()) as { identityToken?: unknown };
  if (typeof body.identityToken !== "string" || body.identityToken.length === 0) {
    return NextResponse.json({ code: "invalid_request" }, { status: 400 });
  }

  const response = await fetch(`${apiUrl}/v1/auth/sessions`, {
    body: JSON.stringify({ identityToken: body.identityToken }),
    cache: "no-store",
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = (await response.json().catch(() => null)) as {
    activeWorkspace?: unknown;
    expiresAt?: unknown;
    sessionToken?: unknown;
  } | null;
  if (
    !response.ok ||
    !payload ||
    typeof payload.sessionToken !== "string" ||
    typeof payload.expiresAt !== "string"
  ) {
    return NextResponse.json({ code: "authentication_failed" }, { status: response.status });
  }

  const result = NextResponse.json({ activeWorkspace: payload.activeWorkspace ?? null });
  result.cookies.set(cookieName, payload.sessionToken, {
    httpOnly: true,
    maxAge: sessionCookieMaxAgeSeconds(payload.expiresAt),
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return result;
}

export async function DELETE() {
  const token = (await cookies()).get(cookieName)?.value;
  try {
    await revokeHollisSession(apiUrl, token ?? null);
  } catch (error) {
    if (error instanceof SessionRevocationUnavailableError) {
      return NextResponse.json({ code: "sign_out_unavailable" }, { status: 503 });
    }
    throw error;
  }

  const result = new NextResponse(null, { status: 204 });
  result.cookies.set(cookieName, "", { expires: new Date(0), path: "/" });
  return result;
}
