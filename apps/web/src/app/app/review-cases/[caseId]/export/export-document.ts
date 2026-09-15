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
import {
  degrees,
  PDFDocument,
  type PDFImage,
  type PDFFont,
  type PDFPage,
  rgb,
  StandardFonts,
} from "pdf-lib";
import type { AttestationRecord } from "../../data";

const HOLLIS_WORDMARK_WATERMARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 950 500"><title>Hollis watermark</title><text x="475" y="315" fill="#073954" fill-opacity="0.055" font-family="Georgia, 'Times New Roman', serif" font-size="210" font-style="italic" font-weight="700" text-anchor="middle" transform="rotate(-32 475 250)">Hollis</text></svg>`;

const transparentPixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

export type CaseReportSource = {
  attestations: AttestationRecord[];
  branding?: {
    logo?: { data: Uint8Array; mediaType: "image/jpeg" | "image/png" };
    organizationName: string;
  };
  exported: ReviewExport;
  identityLabels: Record<string, string>;
};

type ReportTable = {
  headers: string[];
  rows: string[][];
};

type ReportSection = {
  heading: string;
  paragraphs: string[];
  table?: ReportTable;
};

function label(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  const normalized = value.replaceAll("_", " ");
  return `${normalized.slice(0, 1).toUpperCase()}${normalized.slice(1)}`;
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
  const latestAttestation = attestations[0];
  const decisionNarrative = reviewCase.decisionOutcome
    ? `${identityLabel(source, reviewCase.decidedByUserId)} recorded a ${label(reviewCase.decisionOutcome).toLowerCase()} outcome on ${date(reviewCase.decidedAt)}. The final recommendation is ${label(reviewCase.finalRecommendation).toLowerCase()}.`
    : "No human decision has been recorded. The automated recommendation remains informational and must not be used as authorization for a consequential external action.";
  const rationaleNarrative = reviewCase.decisionRationale
    ? `The recorded rationale states: “${reviewCase.decisionRationale}”`
    : "No decision rationale has been recorded.";
  const attestationNarrative = latestAttestation
    ? `The latest independent process attestation was recorded through ${providerLabel(latestAttestation.provider)}. Its current status is ${label(latestAttestation.status).toLowerCase()} and its verdict is ${label(latestAttestation.verdict).toLowerCase()}.`
    : "No independent process attestation receipt is recorded for this case.";

  return [
    {
      heading: "Executive briefing",
      paragraphs: [
        `This report records the review of ${reviewCase.externalReference}. Case ${reviewCase.hollisCaseReference} was created on ${date(reviewCase.createdAt)} after ${reviewCase.automatedSystemVersion} produced a ${label(reviewCase.riskLevel).toLowerCase()} risk recommendation to ${label(reviewCase.recommendation).toLowerCase()}.`,
        `The review was governed by policy ${reviewCase.policyVersion} and control ${reviewCase.ruleId}. The current workflow status is ${label(reviewCase.status).toLowerCase()}. This report records the declared control process and should be read alongside the controlled source evidence where a decision requires evidential review.`,
      ],
      table: {
        headers: ["Record", "Recorded value"],
        rows: [
          ["Hollis case reference", reviewCase.hollisCaseReference],
          ["Source reference", reviewCase.externalReference],
          ["Risk level", label(reviewCase.riskLevel)],
          ["Automated recommendation", label(reviewCase.recommendation)],
          ["Review due", date(reviewCase.reviewDueAt)],
        ],
      },
    },
    {
      heading: "Human review and decision",
      paragraphs: [
        decisionNarrative,
        rationaleNarrative,
        reviewCase.escalationReason
          ? `The case was escalated for the following recorded reason: “${reviewCase.escalationReason}”`
          : "No escalation reason is recorded for this case.",
      ],
      table: {
        headers: ["Review detail", "Recorded value"],
        rows: [
          ["Assigned reviewer", identityLabel(source, reviewCase.assignedToUserId)],
          ["Assignment recorded", date(reviewCase.assignedAt)],
          ["Decision recorded by", identityLabel(source, reviewCase.decidedByUserId)],
          ["Decision outcome", label(reviewCase.decisionOutcome)],
          ["Final recommendation", label(reviewCase.finalRecommendation)],
        ],
      },
    },
    {
      heading: "Policy and evidence basis",
      paragraphs: [
        `The declared policy binding is ${reviewCase.policyVersion} / ${reviewCase.ruleId}. These identifiers establish the rule used to frame this review. They do not, on their own, establish legal or regulatory compliance.`,
        `${reviewCase.evidence.length} managed evidence reference${reviewCase.evidence.length === 1 ? " was" : "s were"} recorded for the case. This report lists controlled references and integrity digests, not the raw evidence. A decision maker should access the controlled source material before relying on an evidence reference.`,
      ],
      table: {
        headers: ["Evidence reference", "Type", "Integrity digest"],
        rows: reviewCase.evidence.map((item) => [item.id, item.mediaType, item.digest]),
      },
    },
    {
      heading: "Independent process attestation",
      paragraphs: [
        attestationNarrative,
        latestAttestation
          ? "The attestation concerns the declared process binding. It does not establish the truth of private evidence or guarantee legal compliance."
          : "A case can be completed without an independent receipt. It must not be described as externally attested until a finalized receipt is recorded.",
      ],
      table: latestAttestation
        ? {
            headers: ["Attestation detail", "Recorded value"],
            rows: [
              ["Provider", providerLabel(latestAttestation.provider)],
              ["Status", label(latestAttestation.status)],
              ["Verdict", label(latestAttestation.verdict)],
              ["Transaction", latestAttestation.transactionHash ?? "Not recorded"],
              ["Case commitment", latestAttestation.caseCommitment],
            ],
          }
        : undefined,
    },
    {
      heading: "Review chronology and record integrity",
      paragraphs: [
        `The append-only case record contains ${exported.events.length} event${exported.events.length === 1 ? "" : "s"}, ordered by event sequence. Each recorded event is linked to the preceding event hash where applicable. Corrections must be recorded as new events rather than changing this chronology.`,
        `The manifest hash below identifies this export. Re-exporting after any new audit event will generate a new manifest hash. The JSON export remains the complete machine-readable companion record.`,
      ],
      table: {
        headers: ["Chronology", "Recorded value"],
        rows: [
          ...exported.events.map((event) => [
            `${event.eventSequence}. ${label(event.eventType)}`,
            `${date(event.createdAt)} · ${auditActorLabel(source, event.actorId)}`,
          ]),
          ["Export schema", exported.schemaVersion],
          ["Manifest hash", exported.manifestHash],
        ],
      },
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
    for (const paragraph of section.paragraphs) lines.push(paragraph, "");
    if (section.table) {
      lines.push(
        `| ${section.table.headers.map(markdownEscape).join(" | ")} |`,
        `| ${section.table.headers.map(() => "---").join(" | ")} |`,
      );
      for (const row of section.table.rows) {
        lines.push(`| ${row.map(markdownEscape).join(" | ")} |`);
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
      children: [
        new TextRun({
          allCaps: true,
          color: "526158",
          size: 17,
          text: "Hollis case decision record",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.TITLE,
      spacing: { after: 80, before: 120 },
      children: [
        new TextRun({
          color: "073954",
          font: "Georgia",
          text: "Formal review and decision report",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({
          color: "526158",
          italics: true,
          text: `${source.exported.case.hollisCaseReference} · ${source.branding?.organizationName ?? "Hollis workspace"}`,
        }),
      ],
    }),
  ];

  for (const section of buildSections(source)) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 260 },
        children: [new TextRun({ color: "073954", font: "Georgia", text: section.heading })],
      }),
    );
    for (const paragraph of section.paragraphs) {
      children.push(
        new Paragraph({
          spacing: { after: 160 },
          children: [new TextRun({ color: "202720", size: 21, text: paragraph })],
        }),
      );
    }
    if (section.table) {
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: section.table.headers.map(
                (header) =>
                  new TableCell({
                    shading: { fill: "073954" },
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({ color: "FFFFFF", size: 17, text: header, bold: true }),
                        ],
                      }),
                    ],
                  }),
              ),
            }),
            ...section.table.rows.map(
              (row) =>
                new TableRow({
                  children: row.map(
                    (value, index) =>
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                color: "202720",
                                size: 18,
                                text: value,
                                bold: index === 0 && section.table?.headers.length === 2,
                              }),
                            ],
                          }),
                        ],
                      }),
                  ),
                }),
            ),
          ],
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
                  new TextRun({
                    color: "073954",
                    font: "Georgia",
                    size: 24,
                    text: "Hollis",
                  }),
                  new TextRun({
                    color: "5A6259",
                    size: 15,
                    text: "  Process attestation record",
                  }),
                ],
              }),
              ...(source.branding?.logo
                ? [
                    new Paragraph({
                      children: [
                        new ImageRun({
                          altText: {
                            description: `${source.branding.organizationName} logo`,
                            name: "Organization logo",
                            title: `${source.branding.organizationName} logo`,
                          },
                          data: Buffer.from(source.branding.logo.data),
                          floating: {
                            allowOverlap: true,
                            horizontalPosition: {
                              align: HorizontalPositionAlign.RIGHT,
                              relative: HorizontalPositionRelativeFrom.PAGE,
                            },
                            verticalPosition: {
                              align: VerticalPositionAlign.TOP,
                              relative: VerticalPositionRelativeFrom.PAGE,
                            },
                            wrap: { type: TextWrappingType.NONE },
                          },
                          transformation: { height: 38, width: 76 },
                          type: source.branding.logo.mediaType === "image/png" ? "png" : "jpg",
                        }),
                      ],
                    }),
                  ]
                : []),
              new Paragraph({
                children: [
                  new ImageRun({
                    altText: {
                      description: "Subtle diagonal Hollis wordmark watermark",
                      name: "Hollis watermark",
                      title: "Hollis watermark",
                    },
                    data: Buffer.from(HOLLIS_WORDMARK_WATERMARK_SVG),
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
                    transformation: { height: 250, width: 475 },
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
  const watermark = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 54;
  const maxWidth = pageSize[0] - margin * 2;
  let page: PDFPage = pdf.addPage(pageSize);
  let y = pageSize[1] - margin;

  const drawWatermark = (target: PDFPage) => {
    target.drawText("Hollis", {
      color: rgb(0.027, 0.224, 0.329),
      opacity: 0.055,
      font: watermark,
      rotate: degrees(35),
      size: 164,
      x: 72,
      y: 250,
    });
  };

  const organizationLogo: PDFImage | null = source.branding?.logo
    ? source.branding.logo.mediaType === "image/png"
      ? await pdf.embedPng(source.branding.logo.data)
      : await pdf.embedJpg(source.branding.logo.data)
    : null;

  const drawExportHeader = (target: PDFPage) => {
    target.drawText("Hollis", {
      color: rgb(0.027, 0.224, 0.329),
      font: bold,
      size: 13,
      x: margin,
      y: pageSize[1] - 30,
    });
    target.drawText("Process attestation record", {
      color: rgb(0.35, 0.38, 0.34),
      font: regular,
      size: 7.5,
      x: margin,
      y: pageSize[1] - 41,
    });
    if (!organizationLogo) return;
    const fitted = organizationLogo.scaleToFit(76, 38);
    target.drawImage(organizationLogo, {
      height: fitted.height,
      width: fitted.width,
      x: pageSize[0] - margin - fitted.width,
      y: pageSize[1] - 48,
    });
  };

  drawWatermark(page);
  drawExportHeader(page);
  y -= 26;

  const newPage = () => {
    page = pdf.addPage(pageSize);
    drawWatermark(page);
    drawExportHeader(page);
    y = pageSize[1] - margin;
    y -= 26;
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
  const drawTable = (table: ReportTable) => {
    const columnGap = 9;
    const usableWidth = maxWidth - columnGap * (table.headers.length - 1);
    const fractions =
      table.headers.length === 2
        ? [0.34, 0.66]
        : table.headers.length === 3
          ? [0.27, 0.2, 0.53]
          : table.headers.map(() => 1 / table.headers.length);
    const widths = fractions.map((fraction) => usableWidth * fraction);
    const positions: number[] = [];
    let position = margin;
    for (const width of widths) {
      positions.push(position);
      position += width + columnGap;
    }

    const drawRow = (cells: string[], header = false) => {
      const font = header ? bold : regular;
      const size = header ? 7.5 : 8.3;
      const lineHeight = size * 1.38;
      const lines = cells.map((cell, index) =>
        wrap(cell, font, size, widths[index] ?? usableWidth),
      );
      const rowHeight = Math.max(...lines.map((entry) => entry.length), 1) * lineHeight + 10;
      if (y < margin + rowHeight) newPage();
      if (header) {
        page.drawRectangle({
          color: rgb(0.027, 0.224, 0.329),
          height: rowHeight,
          width: maxWidth,
          x: margin,
          y: y - rowHeight + 4,
        });
      }
      for (const [index, cellLines] of lines.entries()) {
        for (const [lineIndex, line] of cellLines.entries()) {
          page.drawText(line, {
            color: header ? rgb(1, 1, 1) : rgb(0.14, 0.16, 0.13),
            font,
            size,
            x: positions[index] ?? margin,
            y: y - lineHeight * (lineIndex + 1),
          });
        }
      }
      if (!header) {
        page.drawLine({
          color: rgb(0.82, 0.83, 0.8),
          end: { x: margin + maxWidth, y: y - rowHeight + 4 },
          start: { x: margin, y: y - rowHeight + 4 },
          thickness: 0.45,
        });
      }
      y -= rowHeight;
    };

    drawRow(table.headers, true);
    for (const row of table.rows) drawRow(row);
    y -= 12;
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
    for (const paragraph of section.paragraphs)
      drawLines(paragraph, { font: regular, size: 9.5, gap: 8 });
    if (section.table) drawTable(section.table);
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
