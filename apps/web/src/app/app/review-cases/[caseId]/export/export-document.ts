import type { ReviewExport } from "@hollis/contracts/review-case";
import {
  AlignmentType,
  Document,
  Header,
  HeadingLevel,
  HorizontalPositionAlign,
  HorizontalPositionRelativeFrom,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  TextWrappingType,
  VerticalPositionAlign,
  VerticalPositionRelativeFrom,
  WidthType,
} from "docx";
import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";
import { HOLLIS_MARK_PATH } from "../../../../hollis-brand-assets";
import type { AttestationRecord } from "../../data";

const HOLLIS_WATERMARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><title>Hollis watermark</title><path fill="#073954" fill-opacity="0.07" d="${HOLLIS_MARK_PATH}"/></svg>`;

const transparentPixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

export type CaseReportSource = {
  attestations: AttestationRecord[];
  exported: ReviewExport;
  identityLabels: Record<string, string>;
};

type ReportSection = {
  heading: string;
  paragraphs?: string[];
  rows?: Array<[string, string]>;
};

function label(value: string | null | undefined): string {
  return value ? value.replaceAll("_", " ") : "Not recorded";
}

function date(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function providerLabel(provider: AttestationRecord["provider"]): string {
  return provider === "genlayer" ? "GenLayer" : label(provider);
}

function identityLabel(source: CaseReportSource, actorId: string | null | undefined): string {
  if (!actorId) return "Not recorded";
  return source.identityLabels[actorId] ?? actorId;
}

function auditActorLabel(source: CaseReportSource, actorId: string): string {
  const displayName = source.identityLabels[actorId];
  return displayName ? `${displayName} (${actorId})` : actorId;
}

function buildSections(source: CaseReportSource): ReportSection[] {
  const { attestations, exported } = source;
  const reviewCase = exported.case;
  const finalDecision = reviewCase.decisionOutcome
    ? `A human reviewer recorded the outcome as ${label(reviewCase.decisionOutcome)} and the final recommendation as ${label(reviewCase.finalRecommendation)}.`
    : "No final human decision has been recorded. The automated recommendation must not be treated as authorization for an external action.";
  const attestationSummary = attestations.length
    ? `${attestations.length} attestation record${attestations.length === 1 ? " is" : "s are"} associated with this case. The latest record has status ${label(attestations[0]?.status)} and verdict ${label(attestations[0]?.verdict)}.`
    : "No external attestation receipt is recorded for this case.";

  return [
    {
      heading: "Executive summary",
      paragraphs: [
        `Case ${reviewCase.hollisCaseReference} records a ${label(reviewCase.riskLevel)} risk automated recommendation of ${label(reviewCase.recommendation)}. Its current workflow status is ${label(reviewCase.status)}.`,
        finalDecision,
        `The case is bound to policy ${reviewCase.policyVersion}, control ${reviewCase.ruleId}, and automated system version ${reviewCase.automatedSystemVersion}.`,
        attestationSummary,
      ],
    },
    {
      heading: "Case facts",
      rows: [
        ["Hollis Case Reference", reviewCase.hollisCaseReference],
        ["Source reference", reviewCase.externalReference],
        ["Internal record ID", reviewCase.id],
        ["Created", date(reviewCase.createdAt)],
        ["Review due", date(reviewCase.reviewDueAt)],
        ["Status", label(reviewCase.status)],
        ["Risk level", label(reviewCase.riskLevel)],
        ["Automated recommendation", label(reviewCase.recommendation)],
        ["Automated system", reviewCase.automatedSystemVersion],
      ],
    },
    {
      heading: "Policy and governance context",
      paragraphs: [
        `The recorded policy version is ${reviewCase.policyVersion}. The triggered control is ${reviewCase.ruleId}. These identifiers establish which declared rule governed the review; they do not by themselves prove legal or regulatory compliance.`,
      ],
      rows: [
        ["Policy version", reviewCase.policyVersion],
        ["Triggered control", reviewCase.ruleId],
      ],
    },
    {
      heading: "Evidence inventory",
      paragraphs: [
        `The case contains ${reviewCase.evidence.length} evidence reference${reviewCase.evidence.length === 1 ? "" : "s"}. Hollis exports metadata and integrity digests, not raw evidence content. A decision maker should inspect the controlled source material before relying on a reference.`,
      ],
      rows: reviewCase.evidence.flatMap((item, index) => [
        [`Evidence ${index + 1} identifier`, item.id],
        [`Evidence ${index + 1} media type`, item.mediaType],
        [`Evidence ${index + 1} digest`, item.digest],
      ]),
    },
    {
      heading: "Human review outcome",
      paragraphs: [finalDecision],
      rows: [
        ["Assigned reviewer", identityLabel(source, reviewCase.assignedToUserId)],
        ["Assigned", date(reviewCase.assignedAt)],
        ["Decision outcome", label(reviewCase.decisionOutcome)],
        ["Final recommendation", label(reviewCase.finalRecommendation)],
        ["Decided", date(reviewCase.decidedAt)],
        ["Decision rationale", label(reviewCase.decisionRationale)],
        ["Escalation reason", label(reviewCase.escalationReason)],
      ],
    },
    {
      heading: "Audit chronology",
      paragraphs: [
        `The append-only record contains ${exported.events.length} event${exported.events.length === 1 ? "" : "s"}, ordered by database event sequence. Each event links to the previous event hash where applicable.`,
      ],
      rows: exported.events.flatMap((event) => [
        [
          `Event ${event.eventSequence}`,
          `${label(event.eventType)} at ${date(event.createdAt)} by ${auditActorLabel(source, event.actorId)}`,
        ],
        [`Event ${event.eventSequence} hash`, event.eventHash],
        [`Event ${event.eventSequence} previous hash`, event.previousHash ?? "Genesis event"],
      ]),
    },
    {
      heading: "Attestation status",
      paragraphs: [attestationSummary],
      rows: attestations.flatMap((item, index) => [
        [`Attestation ${index + 1} provider`, providerLabel(item.provider)],
        [`Attestation ${index + 1} status`, label(item.status)],
        [`Attestation ${index + 1} verdict`, label(item.verdict)],
        [`Attestation ${index + 1} transaction`, label(item.transactionHash)],
        [`Attestation ${index + 1} commitment`, item.caseCommitment],
      ]),
    },
    {
      heading: "Decision-use considerations",
      paragraphs: [
        reviewCase.decisionOutcome
          ? "A human outcome is present. Before any external action, confirm that the reviewer had the required authority, that the referenced evidence was available and current, and that the recorded rationale supports the action being considered."
          : "Do not execute an adverse or consequential external action from this record because the required human outcome is absent.",
        attestations.length
          ? "Use the recorded attestation as evidence of the declared process outcome only. It does not independently establish the truth of private evidence or guarantee legal compliance."
          : "No external attestation is recorded. Do not describe this case as externally attested or independently adjudicated.",
        "Any correction should be recorded as a new event. Do not alter or replace the existing audit chronology.",
      ],
    },
    {
      heading: "Record integrity",
      rows: [
        ["Schema version", exported.schemaVersion],
        ["Manifest hash", exported.manifestHash],
      ],
      paragraphs: [
        "The manifest hash identifies this exported record. Re-exporting after a new audit event will produce a different record and may produce a different manifest hash.",
      ],
    },
  ];
}

function markdownEscape(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function buildMarkdownReport(source: CaseReportSource): string {
  const sections = buildSections(source);
  const lines = [
    "# Hollis case decision record",
    "",
    `Generated from authenticated case export ${source.exported.manifestHash}.`,
    "",
  ];

  for (const section of sections) {
    lines.push(`## ${section.heading}`, "");
    for (const paragraph of section.paragraphs ?? []) lines.push(paragraph, "");
    if (section.rows?.length) {
      lines.push("| Field | Recorded value |", "| --- | --- |");
      for (const [field, value] of section.rows) {
        lines.push(`| ${markdownEscape(field)} | ${markdownEscape(value)} |`);
      }
      lines.push("");
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

export async function buildDocxReport(source: CaseReportSource): Promise<Buffer> {
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: "Case decision record", bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: source.exported.case.hollisCaseReference, italics: true })],
    }),
  ];

  for (const section of buildSections(source)) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, text: section.heading }));
    for (const paragraph of section.paragraphs ?? []) {
      children.push(new Paragraph({ text: paragraph, spacing: { after: 180 } }));
    }
    if (section.rows?.length) {
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: section.rows.map(
            ([field, value]) =>
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({ children: [new TextRun({ text: field, bold: true })] }),
                    ],
                  }),
                  new TableCell({ children: [new Paragraph(value)] }),
                ],
              }),
          ),
        }),
      );
    }
  }

  const document = new Document({
    creator: "Hollis",
    description: "Authenticated Hollis case decision record",
    sections: [
      {
        children,
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new ImageRun({
                    altText: {
                      description: "Subtle Hollis Bound Record watermark",
                      name: "Hollis watermark",
                      title: "Hollis watermark",
                    },
                    data: Buffer.from(HOLLIS_WATERMARK_SVG),
                    fallback: { data: transparentPixel, type: "png" },
                    floating: {
                      allowOverlap: true,
                      behindDocument: true,
                      horizontalPosition: {
                        align: HorizontalPositionAlign.CENTER,
                        relative: HorizontalPositionRelativeFrom.PAGE,
                      },
                      verticalPosition: {
                        align: VerticalPositionAlign.CENTER,
                        relative: VerticalPositionRelativeFrom.PAGE,
                      },
                      wrap: { type: TextWrappingType.NONE },
                    },
                    transformation: { height: 210, width: 210 },
                    type: "svg",
                  }),
                ],
              }),
            ],
          }),
        },
      },
    ],
    title: `Hollis case ${source.exported.case.hollisCaseReference}`,
  });
  return Packer.toBuffer(document);
}

function ascii(value: string): string {
  return value
    .normalize("NFKD")
    .replaceAll(/[\u2018\u2019]/g, "'")
    .replaceAll(/[\u201C\u201D]/g, '"')
    .replaceAll(/[^\x20-\x7E]/g, " ");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = ascii(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function buildPdfReport(source: CaseReportSource): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 54;
  const maxWidth = pageSize[0] - margin * 2;
  let page: PDFPage = pdf.addPage(pageSize);
  let y = pageSize[1] - margin;

  const drawWatermark = (target: PDFPage) => {
    const scale = 3.75;
    const markSize = 48 * scale;
    target.drawSvgPath(HOLLIS_MARK_PATH, {
      color: rgb(0.027, 0.224, 0.329),
      opacity: 0.055,
      scale,
      x: (pageSize[0] - markSize) / 2 - 8 * scale,
      y: (pageSize[1] + markSize) / 2 + 8 * scale,
    });
  };

  drawWatermark(page);

  const newPage = () => {
    page = pdf.addPage(pageSize);
    drawWatermark(page);
    y = pageSize[1] - margin;
  };
  const drawLines = (
    text: string,
    options: { font: PDFFont; size: number; color?: ReturnType<typeof rgb>; gap?: number },
  ) => {
    const lineHeight = options.size * 1.42;
    for (const line of wrap(text, options.font, options.size, maxWidth)) {
      if (y < margin + lineHeight) newPage();
      page.drawText(line, {
        x: margin,
        y,
        font: options.font,
        size: options.size,
        color: options.color ?? rgb(0.14, 0.16, 0.13),
      });
      y -= lineHeight;
    }
    y -= options.gap ?? 7;
  };

  drawLines("Case decision record", {
    font: bold,
    size: 24,
    color: rgb(0.027, 0.224, 0.329),
    gap: 3,
  });
  drawLines(source.exported.case.hollisCaseReference, {
    font: regular,
    size: 11,
    color: rgb(0.4, 0.42, 0.38),
    gap: 20,
  });

  for (const section of buildSections(source)) {
    drawLines(section.heading, {
      font: bold,
      size: 15,
      color: rgb(0.027, 0.224, 0.329),
      gap: 8,
    });
    for (const paragraph of section.paragraphs ?? [])
      drawLines(paragraph, { font: regular, size: 9.5, gap: 8 });
    for (const [field, value] of section.rows ?? []) {
      drawLines(field, { font: bold, size: 8.5, color: rgb(0.4, 0.42, 0.38), gap: 1 });
      drawLines(value, { font: regular, size: 9.5, gap: 7 });
    }
    y -= 7;
  }

  const pages = pdf.getPages();
  pages.forEach((item, index) => {
    item.drawText(
      `Hollis | ${source.exported.manifestHash.slice(0, 26)}... | Page ${index + 1} of ${pages.length}`,
      {
        x: margin,
        y: 26,
        font: regular,
        size: 7,
        color: rgb(0.48, 0.49, 0.45),
      },
    );
  });

  return pdf.save();
}
