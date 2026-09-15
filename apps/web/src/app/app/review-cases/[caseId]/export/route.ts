import {
  type ReviewExport,
  reviewExportIdentityLabelsSchema,
  reviewExportSchema,
} from "@hollis/contracts/review-case";
import { NextResponse } from "next/server";
import { readHollisSessionToken } from "@/lib/hollis-session";
import type { AttestationRecord } from "../../data";
import {
  type CaseReportSource,
  buildDocxReport,
  buildMarkdownReport,
  buildPdfReport,
} from "./export-document";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const formats = ["json", "md", "docx", "pdf"] as const;
type ExportFormat = (typeof formats)[number];

const supportedOrganizationLogoMediaTypes = ["image/jpeg", "image/png"] as const;
const maxOrganizationLogoBytes = 1_000_000;

type WorkspaceProfileResponse = {
  logoMediaType?: unknown;
  logoUrl?: unknown;
  name?: unknown;
};

function isExportFormat(value: string | null): value is ExportFormat {
  return formats.includes(value as ExportFormat);
}

function asArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function isSupportedOrganizationLogoMediaType(
  value: string,
): value is (typeof supportedOrganizationLogoMediaTypes)[number] {
  return supportedOrganizationLogoMediaTypes.includes(
    value as (typeof supportedOrganizationLogoMediaTypes)[number],
  );
}

async function resolveExportBranding(
  response: Response | null,
): Promise<CaseReportSource["branding"] | undefined> {
  if (!response?.ok) return undefined;
  const profile = (await response.json().catch(() => null)) as WorkspaceProfileResponse | null;
  if (!profile || typeof profile.name !== "string" || !profile.name.trim()) return undefined;

  const organizationName = profile.name.trim();
  if (typeof profile.logoUrl !== "string" || typeof profile.logoMediaType !== "string") {
    return { organizationName };
  }
  if (!isSupportedOrganizationLogoMediaType(profile.logoMediaType)) return { organizationName };

  try {
    const source = new URL(profile.logoUrl);
    if (source.protocol !== "https:") return { organizationName };
    const logoResponse = await fetch(source, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    const contentType = logoResponse.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase();
    if (!logoResponse.ok || contentType !== profile.logoMediaType) return { organizationName };
    const data = new Uint8Array(await logoResponse.arrayBuffer());
    if (!data.byteLength || data.byteLength > maxOrganizationLogoBytes) return { organizationName };
    return { logo: { data, mediaType: profile.logoMediaType }, organizationName };
  } catch {
    return { organizationName };
  }
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
  const needsDocumentBranding = format === "docx" || format === "pdf";
  const [response, attestationResponse, identityResponse, workspaceResponse] = await Promise.all([
    fetch(`${apiUrl}/v1/review-cases/${caseId}/export`, { cache: "no-store", headers }),
    fetch(`${apiUrl}/v1/review-cases/${caseId}/attestations`, { cache: "no-store", headers }),
    fetch(`${apiUrl}/v1/review-cases/${caseId}/export-identities`, {
      cache: "no-store",
      headers,
    }),
    needsDocumentBranding
      ? fetch(`${apiUrl}/v1/workspace`, { cache: "no-store", headers })
      : Promise.resolve(null),
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
  const branding = await resolveExportBranding(workspaceResponse);
  const source = { attestations, branding, exported, identityLabels };
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
