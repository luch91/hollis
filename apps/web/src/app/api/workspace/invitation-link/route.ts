import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const cookieName = "hollis_invitation_token";

export async function GET(request: Request) {
  const token = (await cookies()).get(cookieName)?.value;
  const response =
    token && /^[A-Za-z0-9_-]{43}$/.test(token)
      ? NextResponse.json({
          invitationUrl: new URL(`/invite/accept?token=${token}`, request.url).toString(),
        })
      : NextResponse.json({ code: "invitation_link_unavailable" }, { status: 404 });
  response.cookies.set(cookieName, "", {
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "strict",
  });
  return response;
}
