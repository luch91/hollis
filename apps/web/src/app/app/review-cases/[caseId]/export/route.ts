import {
  type ReviewExport,
  reviewExportIdentityLabelsSchema,
  reviewExportSchema,
} from "@hollis/contracts/review-case";
import { NextResponse } from "next/server";
import { readHollisSessionToken } from "@/lib/hollis-session";
import type { AttestationRecord } from "../../data";
import { buildDocxReport, buildMarkdownReport, buildPdfReport } from "./export-document";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const formats = ["json", "md", "docx", "pdf"] as const;
type ExportFormat = (typeof formats)[number];

function isExportFormat(value: string | null): value is ExportFormat {
  return formats.includes(value as ExportFormat);
}

function asArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

export async function GET(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const sessionToken = await readHollisSessionToken();
  if (!sessionToken) {
    return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  }

  const { caseId } = await params;
  const requestedFormat = new URL(request.url).searchParams.get("format");
  const format: ExportFormat = isExportFormat(requestedFormat) ? requestedFormat : "json";
  const headers = { authorization: `Bearer ${sessionToken}` };
  const [response, attestationResponse, identityResponse] = await Promise.all([
    fetch(`${apiUrl}/v1/review-cases/${caseId}/export`, { cache: "no-store", headers }),
    fetch(`${apiUrl}/v1/review-cases/${caseId}/attestations`, { cache: "no-store", headers }),
    fetch(`${apiUrl}/v1/review-cases/${caseId}/export-identities`, {
      cache: "no-store",
      headers,
    }),
  ]);

  if (!response.ok) {
    return NextResponse.json(
      { code: "export_unavailable", message: "The case export is unavailable." },
      { status: response.status },
    );
  }

  const parsed = reviewExportSchema.safeParse(await response.json());
  if (!parsed.success) {
    return NextResponse.json(
      { code: "export_invalid", message: "The case export failed validation." },
      { status: 502 },
    );
  }
  const exported: ReviewExport = parsed.data;
  const attestations = attestationResponse.ok
    ? ((await attestationResponse.json()) as AttestationRecord[])
    : [];
  const parsedIdentities = identityResponse.ok
    ? reviewExportIdentityLabelsSchema.safeParse(await identityResponse.json())
    : null;
  const identityLabels = Object.fromEntries(
    parsedIdentities?.success
      ? parsedIdentities.data.identities.map(({ actorId, displayName }) => [actorId, displayName])
      : [],
  );
  const source = { attestations, exported, identityLabels };
  let body: BodyInit;
  let contentType: string;

  if (format === "md") {
    body = buildMarkdownReport(source);
    contentType = "text/markdown; charset=utf-8";
  } else if (format === "docx") {
    body = asArrayBuffer(new Uint8Array(await buildDocxReport(source)));
    contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  } else if (format === "pdf") {
    body = asArrayBuffer(await buildPdfReport(source));
    contentType = "application/pdf";
  } else {
    body = `${JSON.stringify(exported, null, 2)}\n`;
    contentType = "application/json; charset=utf-8";
  }

  return new NextResponse(body, {
    headers: {
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="Hollis_Case-${exported.case.hollisCaseReference}_Audit-Record.${format}"`,
      "content-type": contentType,
      "x-content-type-options": "nosniff",
    },
  });
}
