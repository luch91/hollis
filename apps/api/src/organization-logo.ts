import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import https from "node:https";
import { isIP } from "node:net";
import type { EvidenceStorage } from "./evidence-storage.js";

const maxCandidates = 3;
const maxDocumentBytes = 512 * 1024;
const maxImageBytes = 256 * 1024;
const requestTimeoutMs = 8_000;
const maxRedirects = 3;

type FetchResult = {
  body: Buffer;
  contentType: string;
  url: URL;
};

type CandidateContent = OrganizationLogoCandidate & {
  content: Buffer;
};

export type OrganizationLogoCandidate = {
  digest: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  previewDataUrl: string;
  sizeBytes: number;
  sourceLabel: string;
  sourceUrl: string;
};

export class OrganizationLogoError extends Error {
  constructor(
    readonly code:
      | "logo_candidate_unavailable"
      | "logo_discovery_failed"
      | "logo_not_found"
      | "logo_website_requires_https",
  ) {
    super(code);
    this.name = "OrganizationLogoError";
  }
}

export interface OrganizationLogoService {
  discover(website: string): Promise<OrganizationLogoCandidate[]>;
  importSelected(
    tenantId: string,
    website: string,
    sourceUrl: string,
  ): Promise<{
    digest: string;
    mediaType: "image/jpeg" | "image/png" | "image/webp";
    objectName: string;
    sizeBytes: number;
    sourceHost: string;
  }>;
}

export function createOrganizationLogoService(storage: EvidenceStorage): OrganizationLogoService {
  async function candidatesForWebsite(website: string): Promise<CandidateContent[]> {
    const websiteUrl = requireHttpsUrl(website, "logo_website_requires_https");
    const document = await fetchPublicResource(websiteUrl, maxDocumentBytes, "document");
    if (!isHtml(document.contentType)) throw new OrganizationLogoError("logo_discovery_failed");

    const sources = discoverCandidateSources(document.body.toString("utf8"), document.url);
    const candidates: CandidateContent[] = [];
    for (const source of sources.slice(0, maxCandidates)) {
      try {
        const image = await fetchPublicResource(source.url, maxImageBytes, "image");
        const mediaType = detectedImageType(image.body);
        if (!mediaType) continue;
        const digest = `sha256:${createHash("sha256").update(image.body).digest("hex")}`;
        candidates.push({
          content: image.body,
          digest,
          mediaType,
          previewDataUrl: `data:${mediaType};base64,${image.body.toString("base64")}`,
          sizeBytes: image.body.byteLength,
          sourceLabel: source.label,
          sourceUrl: image.url.toString(),
        });
      } catch {
        // A missing or unsupported page asset is not a discovery failure when other candidates remain.
      }
    }
    return candidates;
  }

  return {
    async discover(website) {
      const candidates = await candidatesForWebsite(website);
      if (!candidates.length) throw new OrganizationLogoError("logo_not_found");
      return candidates.map(({ content: _content, ...candidate }) => candidate);
    },

    async importSelected(tenantId, website, sourceUrl) {
      const candidates = await candidatesForWebsite(website);
      const candidate = candidates.find((item) => item.sourceUrl === sourceUrl);
      if (!candidate) throw new OrganizationLogoError("logo_candidate_unavailable");

      const objectName = `tenants/${tenantId}/organization-logo/${candidate.digest.slice("sha256:".length)}`;
      await storage.put(
        tenantId,
        objectName,
        candidate.content,
        candidate.mediaType,
        candidate.digest,
      );
      return {
        digest: candidate.digest,
        mediaType: candidate.mediaType,
        objectName,
        sizeBytes: candidate.sizeBytes,
        sourceHost: new URL(candidate.sourceUrl).hostname,
      };
    },
  };
}

function requireHttpsUrl(value: string, code: OrganizationLogoError["code"]): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OrganizationLogoError(code);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    throw new OrganizationLogoError(code);
  }
  return url;
}

async function fetchPublicResource(
  input: URL,
  maximumBytes: number,
  expected: "document" | "image",
  redirectCount = 0,
): Promise<FetchResult> {
  const url = requireHttpsUrl(input.toString(), "logo_discovery_failed");
  const address = await resolvePublicAddress(url.hostname);
  const result = await requestPinned(url, address.address, address.family, maximumBytes);
  if (result.statusCode >= 300 && result.statusCode < 400 && result.location) {
    if (redirectCount >= maxRedirects) throw new OrganizationLogoError("logo_discovery_failed");
    return fetchPublicResource(
      new URL(result.location, url),
      maximumBytes,
      expected,
      redirectCount + 1,
    );
  }
  if (result.statusCode !== 200) throw new OrganizationLogoError("logo_discovery_failed");
  if (expected === "document" && !isHtml(result.contentType)) {
    throw new OrganizationLogoError("logo_discovery_failed");
  }
  if (expected === "image" && !result.contentType.startsWith("image/")) {
    throw new OrganizationLogoError("logo_discovery_failed");
  }
  return { body: result.body, contentType: result.contentType, url };
}

async function resolvePublicAddress(hostname: string): Promise<{ address: string; family: 4 | 6 }> {
  const normalized = hostname.replace(/^\[|\]$/g, "");
  const ipFamily = isIP(normalized);
  if (ipFamily === 4 || ipFamily === 6) {
    if (!isPublicAddress(normalized)) throw new OrganizationLogoError("logo_discovery_failed");
    return { address: normalized, family: ipFamily };
  }
  const addresses = await lookup(normalized, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => !isPublicAddress(item.address))) {
    throw new OrganizationLogoError("logo_discovery_failed");
  }
  const first = addresses[0];
  if (!first || (first.family !== 4 && first.family !== 6)) {
    throw new OrganizationLogoError("logo_discovery_failed");
  }
  return { address: first.address, family: first.family };
}

function isPublicAddress(address: string) {
  if (address.includes(":")) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith("::ffff:"))
      return isPublicAddress(normalized.slice("::ffff:".length));
    return !(
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb") ||
      normalized.startsWith("ff")
    );
  }
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  ) {
    return false;
  }
  const first = octets[0] ?? -1;
  const second = octets[1] ?? -1;
  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 192 && second === 0) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 203 && second === 0)
  );
}

function requestPinned(url: URL, address: string, family: 4 | 6, maximumBytes: number) {
  return new Promise<{
    body: Buffer;
    contentType: string;
    location: string | undefined;
    statusCode: number;
  }>((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept:
            "text/html,application/xhtml+xml,image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "User-Agent": "Hollis-Organization-Logo-Importer/1.0",
        },
        lookup: (_hostname, _options, callback) => callback(null, address, family),
        timeout: requestTimeoutMs,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.byteLength;
          if (size > maximumBytes) {
            response.destroy(new OrganizationLogoError("logo_discovery_failed"));
            return;
          }
          chunks.push(Buffer.from(chunk));
        });
        response.on("end", () =>
          resolve({
            body: Buffer.concat(chunks),
            contentType: (
              String(response.headers["content-type"] ?? "").split(";", 1)[0] ?? ""
            ).toLowerCase(),
            location: response.headers.location,
            statusCode: response.statusCode ?? 0,
          }),
        );
        response.on("error", reject);
      },
    );
    request.on("timeout", () =>
      request.destroy(new OrganizationLogoError("logo_discovery_failed")),
    );
    request.on("error", reject);
  });
}

function isHtml(contentType: string) {
  return contentType === "text/html" || contentType === "application/xhtml+xml";
}

function detectedImageType(content: Buffer): OrganizationLogoCandidate["mediaType"] | null {
  if (
    content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (content.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (
    content.subarray(0, 4).toString("ascii") === "RIFF" &&
    content.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function discoverCandidateSources(document: string, baseUrl: URL) {
  const sources: Array<{ label: string; url: URL }> = [];
  const add = (value: string | undefined, label: string) => {
    if (!value) return;
    try {
      const url = new URL(value, baseUrl);
      if (url.protocol === "https:") sources.push({ label, url });
    } catch {
      // Ignore malformed markup values.
    }
  };

  for (const script of document.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      collectSchemaLogos(JSON.parse(script[1] ?? "null"), (value) =>
        add(value, "Organization data"),
      );
    } catch {
      // Ignore malformed structured data.
    }
  }
  for (const match of document.matchAll(
    /<meta\b[^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/gi,
  )) {
    const tag = match[0] ?? "";
    add(readHtmlAttribute(tag, "content"), "Social image");
  }
  for (const match of document.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0] ?? "";
    const rel = readHtmlAttribute(tag, "rel")?.toLowerCase() ?? "";
    if (rel.includes("icon")) add(readHtmlAttribute(tag, "href"), "Website icon");
  }

  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = source.url.toString();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readHtmlAttribute(tag: string, attribute: string) {
  const matcher = new RegExp(`\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = tag.match(matcher);
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function collectSchemaLogos(value: unknown, add: (url: string) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) collectSchemaLogos(item, add);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  const logo = record.logo;
  if (typeof logo === "string") add(logo);
  if (logo && typeof logo === "object" && "url" in logo && typeof logo.url === "string")
    add(logo.url);
  if ("@graph" in record) collectSchemaLogos(record["@graph"], add);
}
