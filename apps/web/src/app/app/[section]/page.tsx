import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getReviewCase,
  listAttestations,
  listReviewCases,
  type AttestationRecord,
  type ReviewCaseDetail,
  type ReviewQueueItem,
} from "../review-cases/data";

const sections = ["cases", "evidence", "receipts", "exports", "policy", "admin"] as const;
type Section = (typeof sections)[number];

function isSection(value: string): value is Section {
  return sections.includes(value as Section);
}

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value))
    : "No deadline";
}

async function loadCaseDetails(cases: ReviewQueueItem[]): Promise<ReviewCaseDetail[]> {
  return Promise.all(cases.map((reviewCase) => getReviewCase(reviewCase.id)));
}

function SectionHeader({
  eyebrow,
  title,
  summary,
}: {
  eyebrow: string;
  title: string;
  summary: string;
}) {
  return (
    <header className="workspace-section-header">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{summary}</p>
    </header>
  );
}

function CaseList({ cases }: { cases: ReviewQueueItem[] }) {
  if (cases.length === 0) {
    return <p className="workspace-empty">No review cases are available in this workspace.</p>;
  }

  return (
    <div className="workspace-list">
      {cases.map((reviewCase) => (
        <Link
          href={`/app?status=${reviewCase.status === "completed" ? "completed" : "active"}&caseId=${reviewCase.id}`}
          key={reviewCase.id}
        >
          <span>
            <strong>{reviewCase.externalReference}</strong>
            <small>
              {reviewCase.status.replaceAll("_", " ")} ·{" "}
              {reviewCase.recommendation.replaceAll("_", " ")}
            </small>
          </span>
          <span>
            <span className={`risk risk-${reviewCase.riskLevel}`}>{reviewCase.riskLevel}</span>
            <small>Due {formatDate(reviewCase.reviewDueAt)}</small>
          </span>
        </Link>
      ))}
    </div>
  );
}

function EvidenceInventory({ cases }: { cases: ReviewCaseDetail[] }) {
  const items = cases.flatMap((reviewCase) =>
    reviewCase.evidence.map((evidence) => ({
      ...evidence,
      externalReference: reviewCase.externalReference,
      caseId: reviewCase.id,
      status: reviewCase.status,
    })),
  );
  if (items.length === 0)
    return <p className="workspace-empty">No managed evidence references are available.</p>;

  return (
    <div className="workspace-list workspace-list-evidence">
      {items.map((evidence) => (
        <Link
          href={`/app?status=${evidence.status === "completed" ? "completed" : "active"}&caseId=${evidence.caseId}#evidence`}
          key={evidence.id}
        >
          <span>
            <strong>{evidence.id}</strong>
            <small>{evidence.mediaType}</small>
          </span>
          <span>
            <small>{evidence.externalReference}</small>
            <code>{evidence.digest}</code>
          </span>
        </Link>
      ))}
    </div>
  );
}

function ReceiptList({
  completedCases,
  records,
}: {
  completedCases: ReviewCaseDetail[];
  records: Array<{ caseId: string; externalReference: string; record: AttestationRecord }>;
}) {
  const recordedCaseIds = new Set(records.map(({ caseId }) => caseId));
  const awaitingAttestation = completedCases.filter(
    (reviewCase) => !recordedCaseIds.has(reviewCase.id),
  );

  return (
    <div className="receipt-register">
      <section aria-labelledby="recorded-receipts-title">
        <div className="receipt-register-heading">
          <div>
            <p className="eyebrow">Recorded</p>
            <h2 id="recorded-receipts-title">Verified attestation receipts</h2>
          </div>
          <strong>{records.length}</strong>
        </div>
        {records.length > 0 ? (
          <div className="workspace-list">
            {records.map(({ caseId, externalReference, record }) => (
              <Link href={`/app/review-cases/${caseId}`} key={record.id}>
                <span>
                  <strong>{externalReference}</strong>
                  <small>{record.caseCommitment}</small>
                </span>
                <span>
                  <span className={`receipt-state receipt-state-${record.verdict ?? "pending"}`}>
                    {record.verdict ?? record.status}
                  </span>
                  <small>{record.status}</small>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="workspace-empty">
            No finalized GenLayer attestation has been verified and imported.
          </p>
        )}
      </section>
      <section aria-labelledby="awaiting-receipts-title">
        <div className="receipt-register-heading">
          <div>
            <p className="eyebrow">Ready for attestation</p>
            <h2 id="awaiting-receipts-title">Completed review cases</h2>
          </div>
          <strong>{awaitingAttestation.length}</strong>
        </div>
        {awaitingAttestation.length > 0 ? (
          <div className="workspace-list">
            {awaitingAttestation.map((reviewCase) => (
              <Link href={`/app/review-cases/${reviewCase.id}#attestation`} key={reviewCase.id}>
                <span>
                  <strong>{reviewCase.externalReference}</strong>
                  <small>
                    Human decision recorded: {reviewCase.decisionOutcome?.replaceAll("_", " ")}
                  </small>
                </span>
                <span>
                  <span className="receipt-state receipt-state-pending">Awaiting attestation</span>
                  <small>Open process controls</small>
                </span>
              </Link>
            ))}
          </div>
        ) : records.length > 0 ? (
          <p className="workspace-empty">Every completed case has an attestation record.</p>
        ) : (
          <p className="workspace-empty">Complete a human review before requesting attestation.</p>
        )}
      </section>
    </div>
  );
}

export default async function WorkspaceSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!isSection(section)) notFound();
  const [openCases, completedCases] = await Promise.all([
    listReviewCases(),
    listReviewCases("completed"),
  ]);
  const cases = [...openCases, ...completedCases];

  if (section === "cases") {
    return (
      <section className="workspace-section-page">
        <SectionHeader
          eyebrow="Case register"
          title="All review cases"
          summary="Every case remains tenant-scoped and is linked to its workflow, evidence references, and audit history."
        />
        <CaseList cases={cases} />
      </section>
    );
  }

  if (section === "exports") {
    return (
      <section className="workspace-section-page">
        <SectionHeader
          eyebrow="Audit export"
          title="Portable case records"
          summary="Exports contain the case record, ordered append-only events, and a manifest hash for the selected case."
        />
        {cases.length === 0 ? (
          <p className="workspace-empty">No case records are available to export.</p>
        ) : (
          <div className="workspace-list export-register">
            {cases.map((reviewCase) => (
              <article key={reviewCase.id}>
                <span>
                  <strong>{reviewCase.externalReference}</strong>
                  <small>{reviewCase.status.replaceAll("_", " ")}</small>
                </span>
                <nav
                  aria-label={`Download ${reviewCase.externalReference}`}
                  className="export-register-actions"
                >
                  <a href={`/app/review-cases/${reviewCase.id}/export?format=json`}>JSON</a>
                  <a href={`/app/review-cases/${reviewCase.id}/export?format=md`}>MD</a>
                  <a href={`/app/review-cases/${reviewCase.id}/export?format=docx`}>DOCX</a>
                  <a href={`/app/review-cases/${reviewCase.id}/export?format=pdf`}>PDF</a>
                </nav>
              </article>
            ))}
          </div>
        )}
      </section>
    );
  }

  if (section === "admin") {
    return (
      <section className="workspace-section-page">
        <SectionHeader
          eyebrow="Workspace administration"
          title="Controlled workspace access"
          summary="Hollis assigns access through WorkOS organization membership and roles. Review records remain isolated to the active organization."
        />
        <div className="workspace-list">
          <Link href="/app/cases">
            <span>
              <strong>Case operations</strong>
              <small>Review, evidence, exports, and receipts remain in the active workspace.</small>
            </span>
            <span className="export-action">Open cases →</span>
          </Link>
          <Link href="/app/policy">
            <span>
              <strong>Policy register</strong>
              <small>Inspect policy bindings recorded on active cases.</small>
            </span>
            <span className="export-action">Open policy →</span>
          </Link>
        </div>
      </section>
    );
  }

  const details = await loadCaseDetails(cases);
  if (section === "evidence") {
    return (
      <section className="workspace-section-page">
        <SectionHeader
          eyebrow="Evidence inventory"
          title="Managed evidence references"
          summary="Hollis records evidence metadata and integrity references. Raw evidence remains outside the reviewer console."
        />
        <EvidenceInventory cases={details} />
      </section>
    );
  }

  if (section === "policy") {
    return (
      <section className="workspace-section-page">
        <SectionHeader
          eyebrow="Policy register"
          title="Bound policy controls"
          summary="Each review case records the policy version and control that governed the reviewer workflow."
        />
        {details.length === 0 ? (
          <p className="workspace-empty">No policy bindings are available.</p>
        ) : (
          <div className="workspace-list">
            {details.map((reviewCase) => (
              <Link
                href={`/app?status=${reviewCase.status === "completed" ? "completed" : "active"}&caseId=${reviewCase.id}#case-summary`}
                key={reviewCase.id}
              >
                <span>
                  <strong>{reviewCase.ruleId}</strong>
                  <small>{reviewCase.policyVersion}</small>
                </span>
                <span>
                  <small>{reviewCase.externalReference}</small>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    );
  }

  const records = (
    await Promise.all(
      details.map(async (reviewCase) => ({
        caseId: reviewCase.id,
        externalReference: reviewCase.externalReference,
        records: await listAttestations(reviewCase.id).catch(() => []),
      })),
    )
  ).flatMap(({ caseId, externalReference, records: caseRecords }) =>
    caseRecords.map((record) => ({ caseId, externalReference, record })),
  );

  return (
    <section className="workspace-section-page">
      <SectionHeader
        eyebrow="Attestation receipts"
        title="Finalized process records"
        summary="A receipt appears only after Hollis has verified and recorded a finalized external attestation."
      />
      <ReceiptList
        completedCases={details.filter((reviewCase) => reviewCase.status === "completed")}
        records={records}
      />
    </section>
  );
}
