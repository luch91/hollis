import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const cookieName = "hollis_session";
const sessionMaxAgeSeconds = 8 * 60 * 60;

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
    sessionToken?: unknown;
  } | null;
  if (!response.ok || !payload || typeof payload.sessionToken !== "string") {
    return NextResponse.json({ code: "authentication_failed" }, { status: response.status });
  }

  const result = NextResponse.json({ activeWorkspace: payload.activeWorkspace ?? null });
  result.cookies.set(cookieName, payload.sessionToken, {
    httpOnly: true,
    maxAge: sessionMaxAgeSeconds,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return result;
}

export async function DELETE() {
  const token = (await cookies()).get(cookieName)?.value;
  if (token) {
    await fetch(`${apiUrl}/v1/auth/sessions/current`, {
      cache: "no-store",
      headers: { authorization: `Bearer ${token}` },
      method: "DELETE",
    }).catch(() => undefined);
  }

  const result = new NextResponse(null, { status: 204 });
  result.cookies.set(cookieName, "", { expires: new Date(0), path: "/" });
  return result;
}
