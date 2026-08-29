import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function GET(_request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const session = await withAuth();
  if (!session.user || !session.accessToken) {
    return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  }

  const { caseId } = await params;
  const response = await fetch(`${apiUrl}/v1/review-cases/${caseId}/export`, {
    cache: "no-store",
    headers: { authorization: `Bearer ${session.accessToken}` },
  });

  if (!response.ok) {
    return NextResponse.json(
      { code: "export_unavailable", message: "The case export is unavailable." },
      { status: response.status },
    );
  }

  return new NextResponse(await response.text(), {
    headers: {
      "content-disposition": `attachment; filename="hollis-case-${caseId}.json"`,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
