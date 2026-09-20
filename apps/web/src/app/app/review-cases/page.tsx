import type { ReviewExport } from "@hollis/contracts/review-case";
import Link from "next/link";
import type { CSSProperties } from "react";
import { readHollisSession } from "@/lib/hollis-session";
import { OperationalPageHeader } from "../operational-page-header";
import { canCreateReviewCases, canPerformHumanReview } from "../workspace-capabilities";
import { claimAction, decideAction, escalateAction } from "./actions";
import { AttestationHorizon } from "./attestation-visuals";
import {
  type AttestationRecord,
  getManagedAttestationStatus,
  getReviewCase,
  getReviewExport,
  listAttestations,
  listReviewCases,
  type ManagedAttestationStatus,
  type ReviewCaseDetail,
  type ReviewQueueItem,
  ReviewServiceError,
} from "./data";
import { ManagedAttestationRefresh } from "./managed-attestation-refresh";
import { keyEvidenceRecords, presentAssignee } from "./review-presentation";

type ReviewerProfile = {
  id: string;
};

type WorkspaceQuery = {
  access?: string;
  caseId?: string;
  risk?: string;
  status?: string;
  tab?: string;
  view?: string;
};

type CaseTab = "summary" | "evidence" | "communications" | "history";

function activeCaseTab(value?: string): CaseTab {
  return value === "evidence" || value === "communications" || value === "history"
    ? value
    : "summary";
}

function workspaceHref(query: WorkspaceQuery, changes: WorkspaceQuery) {
  const merged = { ...query, ...changes };
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value) parameters.set(key, value);
  }
  return `/app/review-cases?${parameters.toString()}`;
}

function formatDate(value: string | null, includeTime = false) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
  }).format(new Date(value));
}

function shortId(value: string) {
  return value.length > 17 ? `${value.slice(0, 14)}...` : value;
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

function CaseQueue({
  canCreate,
  cases,
  query,
  selectedId,
  totalCount,
}: {
  canCreate: boolean;
  cases: ReviewQueueItem[];
  query: WorkspaceQuery;
  selectedId?: string;
  totalCount: number;
}) {
  const filtersActive = Boolean(query.risk || query.status);
  const queueLabel =
    query.status === "completed"
      ? "Completed Cases"
      : query.status === "all"
        ? "All Cases"
        : query.status === "escalated"
          ? "Escalated Cases"
          : "Active Cases";
  return (
    <aside className="reference-queue">
      <div className="reference-queue-heading">
        <div>
          <h1>
            {queueLabel} <span>{totalCount}</span>
          </h1>
          {canCreate ? (
            <Link className="new-review-case-link" href="/app/review-cases/new">
              New review case
            </Link>
          ) : null}
        </div>
        <details className="queue-filter-menu" open={filtersActive}>
          <summary aria-label="Queue filters">☷</summary>
          <form action="/app/review-cases" method="get">
            <label>
              Workflow status
              <select defaultValue={query.status ?? "active"} name="status">
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="in_review">In review</option>
                <option value="escalated">Escalated</option>
                <option value="completed">Completed</option>
                <option value="all">All</option>
              </select>
            </label>
            <label>
              Risk level
              <select defaultValue={query.risk ?? ""} name="risk">
                <option value="">All risks</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
            <input name="view" type="hidden" value={query.view ?? ""} />
            <input name="tab" type="hidden" value={query.tab ?? ""} />
            <div>
              <button type="submit">Apply</button>
              <Link href="/app/review-cases">Reset</Link>
            </div>
          </form>
        </details>
      </div>
      <div className="reference-case-list">
        {cases.length === 0 ? (
          <p className="reference-empty">No active review cases.</p>
        ) : (
          cases.map((item, index) => (
            <Link
              className={item.id === selectedId ? "is-selected" : undefined}
              href={workspaceHref(query, { caseId: item.id })}
              key={item.id}
              style={{ "--case-index": index } as CSSProperties}
            >
              <span>
                <strong>{item.hollisCaseReference}</strong>
                <small>{item.externalReference}</small>
                <small>{humanize(item.recommendation)}</small>
                <em className={`queue-state queue-state-${item.status}`}>
                  {humanize(item.status)}
                </em>
              </span>
              <span>
                <small>Hollis case</small>
                <small>{formatDate(item.reviewDueAt)}</small>
                <em className={`risk risk-${item.riskLevel}`}>{item.riskLevel}</em>
              </span>
            </Link>
          ))
        )}
      </div>
      <Link className="view-all-cases" href="/app/cases">
        View all cases <span>›</span>
      </Link>
    </aside>
  );
}

function CaseSummaryPanel({
  query,
  reviewCase,
}: {
  query: WorkspaceQuery;
  reviewCase: ReviewCaseDetail;
}) {
  const evidence = keyEvidenceRecords(reviewCase.evidence).slice(0, 3);
  return (
    <div className="case-summary-records" id="case-summary">
      <section className="case-summary-card" aria-labelledby="case-summary-title">
        <div className="case-record-heading">
          <div>
            <span>Decision context</span>
            <h3 id="case-summary-title">What needs a human decision?</h3>
          </div>
          <em className={`risk risk-${reviewCase.riskLevel}`}>{reviewCase.riskLevel} risk</em>
        </div>
        <p className="case-context-copy">
          {reviewCase.automatedSystemVersion} recommended{" "}
          <strong>{humanize(reviewCase.recommendation)}</strong> for this case. Review the recorded
          evidence and policy requirement before confirming, changing, or escalating the outcome.
        </p>
        <dl className="case-fact-grid">
          <div>
            <dt>Reference</dt>
            <dd>{reviewCase.hollisCaseReference}</dd>
          </div>
          <div>
            <dt>Recommendation</dt>
            <dd>{humanize(reviewCase.recommendation)}</dd>
          </div>
          <div>
            <dt>Automated system</dt>
            <dd>{reviewCase.automatedSystemVersion}</dd>
          </div>
          <div>
            <dt>Review due</dt>
            <dd>{formatDate(reviewCase.reviewDueAt)}</dd>
          </div>
        </dl>
      </section>

      <section
        className="case-summary-card case-evidence-inventory"
        aria-labelledby="evidence-inventory-title"
      >
        <div className="case-record-heading">
          <div>
            <span>Managed evidence</span>
            <h3 id="evidence-inventory-title">Evidence inventory ({reviewCase.evidence.length})</h3>
          </div>
          <Link href={workspaceHref(query, { tab: "evidence" })}>View all</Link>
        </div>
        {evidence.length > 0 ? (
          <div className="case-evidence-rows">
            {evidence.map(({ key, record: item }) => (
              <article key={key}>
                <span aria-hidden="true">▱</span>
                <div>
                  <strong>{item.id}</strong>
                  <small>{item.mediaType}</small>
                </div>
                <code>{shortId(item.digest)}</code>
                <em>Verified</em>
              </article>
            ))}
          </div>
        ) : (
          <p className="case-summary-empty">No evidence references have been recorded.</p>
        )}
      </section>

      <section
        className="case-summary-card case-policy-binding"
        aria-labelledby="policy-binding-title"
      >
        <div className="case-record-heading">
          <div>
            <span>Governance control</span>
            <h3 id="policy-binding-title">Policy binding</h3>
          </div>
          <Link href="/app/policy">View policy</Link>
        </div>
        <dl>
          <div>
            <dt>Policy</dt>
            <dd>{reviewCase.policyVersion}</dd>
          </div>
          <div>
            <dt>Control</dt>
            <dd>{reviewCase.ruleId}</dd>
          </div>
          <div>
            <dt>Requirement</dt>
            <dd>Human decision required</dd>
          </div>
        </dl>
        <span className="policy-binding-state">Bound</span>
      </section>
    </div>
  );
}

function CaseHistory({ exported }: { exported: ReviewExport }) {
  return (
    <section className="case-history" id="history">
      <div className="case-history-heading">
        <div>
          <span>Event log</span>
          <small>Append-only</small>
        </div>
        <strong>{exported.events.length} events</strong>
      </div>
      <div className="case-commitment-summary" data-testid="case-commitment-summary">
        <span>
          {exported.canonical
            ? exported.canonical.commitmentVersion
            : "Legacy: hollis.review-export.v1 manifest"}
        </span>
        <code>{exported.canonical?.caseCommitment ?? exported.manifestHash}</code>
      </div>
      <ol>
        {exported.events.map((event) => (
          <li key={event.eventSequence}>
            <span>{String(event.eventSequence).padStart(2, "0")}</span>
            <div>
              <strong>{event.eventType.replaceAll("_", " ")}</strong>
              <small>{formatDate(event.createdAt, true)}</small>
            </div>
            <code>{shortId(event.eventHash)}</code>
          </li>
        ))}
      </ol>
    </section>
  );
}

function CaseEvidencePanel({
  canCreate,
  reviewCase,
}: {
  canCreate: boolean;
  reviewCase: ReviewCaseDetail;
}) {
  return (
    <section className="case-tab-panel case-evidence-panel" aria-labelledby="evidence-panel-title">
      <div className="case-tab-panel-heading">
        <div>
          <span>Managed evidence</span>
          <h3 id="evidence-panel-title">Evidence references</h3>
        </div>
        {canCreate && reviewCase.status !== "completed" ? (
          <Link href={`/app/review-cases/${reviewCase.id}#add-evidence`}>Add evidence</Link>
        ) : null}
      </div>
      {reviewCase.evidence.length > 0 ? (
        <div className="case-tab-records">
          {keyEvidenceRecords(reviewCase.evidence).map(({ key, record: evidence }, index) => (
            <article key={key}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{evidence.id}</strong>
                <small>{evidence.mediaType}</small>
              </div>
              <code>{evidence.digest}</code>
            </article>
          ))}
        </div>
      ) : (
        <p className="case-tab-empty">No managed evidence references have been recorded.</p>
      )}
    </section>
  );
}

function CaseCommunicationsPanel({ reviewCase }: { reviewCase: ReviewCaseDetail }) {
  const communications = [
    reviewCase.escalationReason
      ? {
          label: "Escalation reason",
          text: reviewCase.escalationReason,
          time: reviewCase.escalatedAt,
        }
      : null,
    reviewCase.decisionRationale
      ? {
          label: "Decision rationale",
          text: reviewCase.decisionRationale,
          time: reviewCase.decidedAt,
        }
      : null,
  ].filter((item): item is { label: string; text: string; time: string | null } => item !== null);

  return (
    <section className="case-tab-panel" aria-labelledby="communications-panel-title">
      <div className="case-tab-panel-heading">
        <div>
          <span>Review record</span>
          <h3 id="communications-panel-title">Communications</h3>
        </div>
        <strong>{communications.length} recorded</strong>
      </div>
      {communications.length > 0 ? (
        <div className="case-communication-records">
          {communications.map((communication) => (
            <article key={communication.label}>
              <span>{communication.label.slice(0, 1)}</span>
              <div>
                <strong>{communication.label}</strong>
                <small>{formatDate(communication.time, true)}</small>
                <p>{communication.text}</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="case-tab-empty">No escalation reason or decision rationale is recorded.</p>
      )}
    </section>
  );
}

function HumanReviewPanel({
  canReview,
  reviewCase,
  reviewer,
}: {
  canReview: boolean;
  reviewCase: ReviewCaseDetail;
  reviewer: ReviewerProfile;
}) {
  const needsClaim = reviewCase.status === "pending" || reviewCase.status === "escalated";
  const isAssignedReviewer = reviewCase.assignedToUserId === reviewer.id;
  const assignee = presentAssignee(reviewCase.assignedToUserId, reviewCase.assignedReviewer);
  return (
    <section className="human-review-card">
      <div className="human-review-title">
        <div>
          <span className="review-step-label">Step 3 of 4</span>
          <h2>Record human judgment</h2>
        </div>
        <span className={`review-state review-state-${reviewCase.status}`}>
          {humanize(reviewCase.status)}
        </span>
      </div>
      <p>
        Your decision remains the authoritative operational outcome. GenLayer later verifies that
        the declared review process met the selected policy requirement.
      </p>
      <div className="review-assignee">
        <span aria-label={`${assignee.name} profile`} className="reviewer-avatar" role="img">
          {assignee.name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <small>Assigned to</small>
          <strong>{assignee.name}</strong>
          {assignee.meta ? <small>{assignee.meta}</small> : null}
        </div>
        <div>
          <small>Due</small>
          <strong>{formatDate(reviewCase.reviewDueAt)}</strong>
        </div>
      </div>
      {!canReview && reviewCase.status !== "completed" ? (
        <div className="recorded-decision">
          <span>Read-only review</span>
          <strong>Human review actions are restricted.</strong>
          <p>
            Your workspace role can inspect this record but cannot claim, escalate, or decide it.
          </p>
        </div>
      ) : needsClaim ? (
        <form action={claimAction} className="review-button-row">
          <input name="caseId" type="hidden" value={reviewCase.id} />
          <button className="reference-primary" type="submit">
            Claim for review <span>›</span>
          </button>
        </form>
      ) : reviewCase.status === "in_review" && isAssignedReviewer ? (
        <div className="inline-review-actions">
          <form action={decideAction}>
            <input name="caseId" type="hidden" value={reviewCase.id} />
            <fieldset className="review-outcome-options">
              <legend>How should Hollis record the outcome?</legend>
              <label>
                <input defaultChecked name="outcome" type="radio" value="approved" />
                <span>
                  <strong>Confirm the recommendation</strong>
                  <small>Record that the automated recommendation is appropriate.</small>
                </span>
              </label>
              <label>
                <input name="outcome" type="radio" value="modified" />
                <span>
                  <strong>Change the recommendation</strong>
                  <small>Record a different final recommendation after your review.</small>
                </span>
              </label>
              <label>
                <input name="outcome" type="radio" value="rejected" />
                <span>
                  <strong>Reject the recommendation</strong>
                  <small>Record that the automated recommendation should not be followed.</small>
                </span>
              </label>
            </fieldset>
            <label className="review-field">
              <span>Final recommendation</span>
              <select defaultValue={reviewCase.recommendation} name="finalRecommendation">
                <option value="approve">Approve</option>
                <option value="deny">Deny</option>
                <option value="partial_approve">Partial approve</option>
                <option value="investigate">Investigate</option>
                <option value="refer">Refer</option>
              </select>
            </label>
            <label className="review-field">
              <span>Why is this the right outcome?</span>
              <textarea
                name="rationale"
                placeholder="Reference the evidence or policy requirement that informed your decision."
                required
              />
            </label>
            <button className="reference-primary" type="submit">
              Record human decision <span>›</span>
            </button>
          </form>
          <details className="review-escalation">
            <summary>Escalate instead</summary>
            <p>Use escalation when another qualified reviewer should take the next decision.</p>
            <form action={escalateAction}>
              <input name="caseId" type="hidden" value={reviewCase.id} />
              <label className="review-field">
                <span>Why does this need escalation?</span>
                <textarea
                  name="reason"
                  placeholder="Explain what requires another review."
                  required
                />
              </label>
              <button className="reference-secondary" type="submit">
                Escalate for review
              </button>
            </form>
          </details>
        </div>
      ) : reviewCase.status === "in_review" ? (
        <div className="recorded-decision">
          <span>Review in progress</span>
          <strong>Assigned to {assignee.name}</strong>
          <p>Only the assigned reviewer can record or escalate this decision.</p>
        </div>
      ) : (
        <div className="recorded-decision">
          <span>Recorded outcome</span>
          <strong>
            {reviewCase.decisionOutcome ? humanize(reviewCase.decisionOutcome) : "Not recorded"}
          </strong>
          <p>{reviewCase.decisionRationale}</p>
        </div>
      )}
    </section>
  );
}

function ReviewProgress({
  attestations,
  reviewCase,
}: {
  attestations: AttestationRecord[];
  reviewCase: ReviewCaseDetail;
}) {
  const hasFinalReceipt = attestations.some((attestation) => attestation.status === "finalized");
  const steps = [
    { label: "Case details", complete: true },
    { label: "Evidence", complete: reviewCase.evidence.length > 0 },
    { label: "Human review", complete: reviewCase.decisionOutcome !== null },
    { label: "Independent attestation", complete: hasFinalReceipt },
  ];
  const activeIndex = steps.findIndex((step) => !step.complete);
  return (
    <ol className="guided-review-progress" aria-label="Review progress">
      {steps.map((step, index) => (
        <li
          className={
            step.complete ? "is-complete" : index === activeIndex ? "is-active" : undefined
          }
          key={step.label}
        >
          <span>{step.complete ? "✓" : String(index + 1)}</span>
          <strong>{step.label}</strong>
        </li>
      ))}
    </ol>
  );
}

function ReviewEmptyState({ canCreate, filtered }: { canCreate: boolean; filtered: boolean }) {
  const title = filtered ? "No cases match this view." : "No cases need your attention.";
  const description = filtered
    ? "Try clearing a filter, or browse completed cases to inspect prior review records."
    : "When a consequential AI decision is submitted for review, it will appear here.";
  return (
    <section className="review-empty-workspace" aria-labelledby="review-empty-title">
      <div className="review-empty-main">
        <span aria-hidden="true" className="review-empty-mark">
          ✓
        </span>
        <h1 id="review-empty-title">{title}</h1>
        <p>{description}</p>
        <div className="review-empty-actions">
          {canCreate ? (
            <Link className="reference-primary" href="/app/review-cases/new">
              Create a review case <span>›</span>
            </Link>
          ) : null}
          <Link className="review-empty-link" href="/app/cases">
            Browse completed cases <span>›</span>
          </Link>
        </div>
        <ol className="review-empty-steps">
          <li>
            <span>1</span>
            <strong>Create a case</strong>
            <small>Describe the consequential AI decision.</small>
          </li>
          <li>
            <span>2</span>
            <strong>Add evidence</strong>
            <small>Attach the material that supports review.</small>
          </li>
          <li>
            <span>3</span>
            <strong>Record judgment</strong>
            <small>Confirm, change, or escalate the outcome.</small>
          </li>
          <li>
            <span>4</span>
            <strong>Verify the process</strong>
            <small>Hollis records a GenLayer receipt automatically.</small>
          </li>
        </ol>
      </div>
      <aside className="review-empty-next">
        <p className="eyebrow">Optional guide</p>
        <h2>What happens next</h2>
        <p>
          Review the decision, assess its evidence, and record human judgment. Hollis then checks
          the declared process with GenLayer and issues a portable receipt.
        </p>
        <Link href="/app/policy">
          Review policy library <span>›</span>
        </Link>
      </aside>
    </section>
  );
}

function ExportPreview({
  reviewCase,
  attestations,
}: {
  reviewCase: ReviewCaseDetail;
  attestations: AttestationRecord[];
}) {
  const latest = attestations.at(0);
  const base = `/app/review-cases/${reviewCase.id}/export`;
  return (
    <div className="reference-export-grid">
      <section className="paper-panel">
        <div className="paper-panel-title">
          <div>
            <h3>Audit Export Preview</h3>
            <p>What decision makers will receive</p>
          </div>
        </div>
        <div className="paper-stack audit-paper">
          <div className="paper-heading">
            <strong>{reviewCase.hollisCaseReference}</strong>
            <span>Case decision record</span>
          </div>
          <dl>
            <div>
              <dt>Case summary</dt>
              <dd>Recorded</dd>
            </div>
            <div>
              <dt>Policy and scope</dt>
              <dd>{reviewCase.policyVersion}</dd>
            </div>
            <div>
              <dt>Evidence inventory</dt>
              <dd>{reviewCase.evidence.length} references</dd>
            </div>
            <div>
              <dt>Human review</dt>
              <dd>{reviewCase.decisionOutcome ?? "Pending"}</dd>
            </div>
            <div>
              <dt>Audit chronology</dt>
              <dd>Append-only</dd>
            </div>
          </dl>
          <div className="paper-total">
            <span>Record</span>
            <strong>{reviewCase.hollisCaseReference}</strong>
          </div>
        </div>
        <nav className="export-formats" aria-label="Export formats">
          <a href={`${base}?format=json`}>JSON</a>
          <a href={`${base}?format=md`}>MD</a>
          <a href={`${base}?format=docx`}>DOCX</a>
          <a href={`${base}?format=pdf`}>PDF</a>
        </nav>
      </section>
      <section className="paper-panel receipt-panel">
        <div className="paper-panel-title">
          <div>
            <h3>Final Receipt (Portable)</h3>
            <p>Verifiable process attestation</p>
          </div>
        </div>
        <div className="paper-stack receipt-paper">
          <div className="receipt-paper-heading">
            <strong>{reviewCase.hollisCaseReference}</strong>
            <span className={latest?.verdict === "pass" ? "is-verifiable" : undefined}>
              {latest?.verdict ?? "Pending"}
            </span>
          </div>
          <dl>
            <div>
              <dt>Receipt ID</dt>
              <dd>{latest ? shortId(latest.id) : "Not issued"}</dd>
            </div>
            <div>
              <dt>Date issued</dt>
              <dd>{latest ? formatDate(latest.createdAt, true) : "Not issued"}</dd>
            </div>
            <div>
              <dt>Policy</dt>
              <dd>{reviewCase.policyVersion}</dd>
            </div>
            <div>
              <dt>Verdict</dt>
              <dd>{latest?.verdict ?? "Pending"}</dd>
            </div>
            <div>
              <dt>Case status</dt>
              <dd>{reviewCase.status}</dd>
            </div>
          </dl>
          <div className="receipt-seal">
            <span>Generated by Hollis</span>
          </div>
        </div>
        <a className="download-receipt" href={`${base}?format=pdf`}>
          Download record <span>↓</span>
        </a>
      </section>
    </div>
  );
}

function SelectedCaseWorkspace({
  canCreate,
  canReview,
  reviewCase,
  attestations,
  managedAttestation,
  exported,
  reviewer,
  query,
}: {
  canCreate: boolean;
  canReview: boolean;
  reviewCase: ReviewCaseDetail;
  attestations: AttestationRecord[];
  managedAttestation: ManagedAttestationStatus;
  exported: ReviewExport;
  reviewer: ReviewerProfile;
  query: WorkspaceQuery;
}) {
  const tab = activeCaseTab(query.tab);
  const managedPending =
    managedAttestation.deployment?.status === "submitted" ||
    managedAttestation.submission?.status === "submitted" ||
    managedAttestation.submission?.status === "submitting";
  return (
    <>
      <section className="reference-case-workspace">
        <header className="reference-case-header">
          <div className="case-kicker">
            <span>{reviewCase.hollisCaseReference}</span>
            <em className={`queue-state queue-state-${reviewCase.status}`}>
              {humanize(reviewCase.status)}
            </em>
          </div>
          <h2>{reviewCase.externalReference}</h2>
          <p className="case-reference-label">Review case {reviewCase.hollisCaseReference}</p>
          <p>{humanize(reviewCase.ruleId)}</p>
          <dl>
            <div>
              <dt>Initiated</dt>
              <dd>{formatDate(reviewCase.createdAt)}</dd>
            </div>
            <div>
              <dt>Initiated by</dt>
              <dd>{reviewCase.automatedSystemVersion}</dd>
            </div>
            <div>
              <dt>Due</dt>
              <dd>{formatDate(reviewCase.reviewDueAt)}</dd>
            </div>
            <div>
              <dt>Policy</dt>
              <dd>{reviewCase.policyVersion}</dd>
            </div>
          </dl>
        </header>
        <ReviewProgress attestations={attestations} reviewCase={reviewCase} />
        <nav className="case-tabs" aria-label="Case sections">
          <Link
            aria-current={tab === "summary" ? "page" : undefined}
            className={tab === "summary" ? "is-active" : undefined}
            href={workspaceHref(query, { tab: "summary" })}
          >
            Case Summary
          </Link>
          <Link
            aria-current={tab === "evidence" ? "page" : undefined}
            className={tab === "evidence" ? "is-active" : undefined}
            href={workspaceHref(query, { tab: "evidence" })}
          >
            Evidence ({reviewCase.evidence.length})
          </Link>
          <Link
            aria-current={tab === "communications" ? "page" : undefined}
            className={tab === "communications" ? "is-active" : undefined}
            href={workspaceHref(query, { tab: "communications" })}
          >
            Communications (
            {[reviewCase.escalationReason, reviewCase.decisionRationale].filter(Boolean).length})
          </Link>
          <Link
            aria-current={tab === "history" ? "page" : undefined}
            className={tab === "history" ? "is-active" : undefined}
            href={workspaceHref(query, { tab: "history" })}
          >
            History
          </Link>
          <Link className="case-detail-link" href={`/app/review-cases/${reviewCase.id}`}>
            Open full case
          </Link>
        </nav>
        {tab === "summary" ? (
          <>
            <CaseSummaryPanel query={query} reviewCase={reviewCase} />
            <HumanReviewPanel canReview={canReview} reviewCase={reviewCase} reviewer={reviewer} />
          </>
        ) : null}
        {tab === "evidence" ? (
          <CaseEvidencePanel canCreate={canCreate} reviewCase={reviewCase} />
        ) : null}
        {tab === "communications" ? <CaseCommunicationsPanel reviewCase={reviewCase} /> : null}
        {tab === "history" ? <CaseHistory exported={exported} /> : null}
      </section>
      <aside className="reference-right-rail">
        <ManagedAttestationRefresh active={managedPending} />
        <div className="right-rail-heading">
          <div>
            <p className="eyebrow">Process verification</p>
            <h2>What happens next</h2>
            <p>Hollis records your decision, then GenLayer checks the declared process.</p>
          </div>
          <nav className="right-rail-actions" aria-label="Selected case actions">
            {canCreate && reviewCase.status !== "completed" ? (
              <Link href={`/app/review-cases/${reviewCase.id}#add-evidence`}>Add evidence</Link>
            ) : null}
            <Link href={`/app/review-cases/${reviewCase.id}`}>View details</Link>
          </nav>
        </div>
        <AttestationHorizon
          attestations={attestations}
          managedSubmission={managedAttestation.submission}
          reviewCase={reviewCase}
        />
        <GenLayerPanel
          attestations={attestations}
          managedAttestation={managedAttestation}
          reviewCase={reviewCase}
        />
        <ExportPreview attestations={attestations} reviewCase={reviewCase} />
      </aside>
    </>
  );
}

function GenLayerPanel({
  attestations,
  managedAttestation,
  reviewCase,
}: {
  attestations: AttestationRecord[];
  managedAttestation: ManagedAttestationStatus;
  reviewCase: ReviewCaseDetail;
}) {
  const latest = attestations.at(0);
  const humanDecisionRecorded = reviewCase.decisionOutcome !== null;
  const status =
    managedAttestation.submission?.status ??
    managedAttestation.deployment?.status ??
    latest?.status ??
    (humanDecisionRecorded ? "review complete" : "awaiting review");
  return (
    <section className="genlayer-panel" aria-labelledby="genlayer-panel-title">
      <div className={`genlayer-status genlayer-status-${status.replaceAll(" ", "-")}`}>
        <span aria-hidden="true">◉</span>
        <strong>{status}</strong>
      </div>
      <h3 id="genlayer-panel-title">GenLayer attestation</h3>
      <p>
        GenLayer independently checks the declared process after Hollis records the human review.
      </p>
      {managedAttestation.submission ? (
        <dl className="genlayer-result">
          <div>
            <dt>Verdict</dt>
            <dd>{managedAttestation.submission.verdict ?? "Awaiting finalization"}</dd>
          </div>
          <div>
            <dt>Transaction</dt>
            <dd>{managedAttestation.submission.transactionHash ?? "Queued by Hollis"}</dd>
          </div>
        </dl>
      ) : latest ? (
        <dl className="genlayer-result">
          <div>
            <dt>Verdict</dt>
            <dd>{latest.verdict ?? "Pending"}</dd>
          </div>
          <div>
            <dt>Transaction</dt>
            <dd>{latest.transactionHash ?? "Awaiting finalization"}</dd>
          </div>
        </dl>
      ) : (
        <Link className="genlayer-action" href={`/app/review-cases/${reviewCase.id}#attestation`}>
          View attestation requirements <span>›</span>
        </Link>
      )}
    </section>
  );
}

function ReviewServiceUnavailable() {
  return (
    <section className="reference-dashboard">
      <aside className="reference-queue" aria-label="Review queue">
        <div className="reference-queue-heading">
          <h1>
            Active Cases <span>0</span>
          </h1>
        </div>
      </aside>
      <div className="reference-dashboard-empty reference-service-unavailable">
        <span>Service recovery</span>
        <h1>The review workspace is temporarily unavailable.</h1>
        <p>
          Your session is still active. No review decision, evidence record, or attestation has been
          changed.
        </p>
        <Link className="reference-primary" href="/app/review-cases">
          Retry workspace <span>›</span>
        </Link>
      </div>
    </section>
  );
}

function WorkspaceProvisioningRequired() {
  return (
    <section className="reference-dashboard">
      <aside className="reference-queue" aria-label="Review queue">
        <div className="reference-queue-heading">
          <h1>
            Active Cases <span>0</span>
          </h1>
        </div>
      </aside>
      <div className="reference-dashboard-empty reference-service-unavailable">
        <span>Workspace setup</span>
        <h1>Finish connecting this Hollis workspace.</h1>
        <p>
          This workspace is unavailable to the current session. Sign in again or select a workspace
          you have been invited to.
        </p>
        <Link className="reference-primary" href="/onboarding">
          Workspace setup <span>›</span>
        </Link>
      </div>
    </section>
  );
}

export default async function ReviewCasesPage({
  query: explicitQuery,
  searchParams,
}: {
  query?: WorkspaceQuery;
  searchParams?: Promise<WorkspaceQuery>;
} = {}) {
  const query = explicitQuery ?? (searchParams ? await searchParams : {});
  const session = await readHollisSession();
  if (!session) throw new Error("An authenticated reviewer profile is required.");
  const activeRole = session.session.activeWorkspace?.role ?? "";
  const canCreate = canCreateReviewCases(activeRole);
  const canReview = canPerformHumanReview(activeRole);

  const [activeCasesResult, completedCasesResult] = await Promise.allSettled([
    listReviewCases(),
    listReviewCases("completed"),
  ]);
  if (activeCasesResult.status === "rejected" || completedCasesResult.status === "rejected") {
    const queueErrors = [activeCasesResult, completedCasesResult]
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => result.reason);
    if (
      queueErrors.some(
        (error) =>
          error instanceof ReviewServiceError && error.code === "workspace_not_provisioned",
      )
    ) {
      return <WorkspaceProvisioningRequired />;
    }
    return <ReviewServiceUnavailable />;
  }

  const activeCases = activeCasesResult.value;
  const completedCases = completedCasesResult.value;
  const reviewer: ReviewerProfile = {
    id: session.session.userId,
  };
  const allCases = [...activeCases, ...completedCases];
  const statusCases =
    query.status === "completed"
      ? completedCases
      : query.status && !["active", "all"].includes(query.status)
        ? allCases.filter((item) => item.status === query.status)
        : query.status === "all"
          ? allCases
          : activeCases;
  const riskCases = query.risk
    ? statusCases.filter((item) => item.riskLevel === query.risk)
    : statusCases;
  const filteredQueue = riskCases.slice(0, 12);
  const explicitlySelected = query.caseId
    ? allCases.find((item) => item.id === query.caseId)
    : undefined;
  const queue =
    explicitlySelected && !filteredQueue.some((item) => item.id === explicitlySelected.id)
      ? [explicitlySelected, ...filteredQueue].slice(0, 12)
      : filteredQueue;
  const selectedQueueItem = explicitlySelected ?? queue.at(0);
  const selectedCaseResult = selectedQueueItem
    ? await getReviewCase(selectedQueueItem.id).then(
        (value) => ({ value }),
        () => null,
      )
    : null;
  if (selectedQueueItem && !selectedCaseResult) return <ReviewServiceUnavailable />;

  const reviewCase = selectedCaseResult?.value ?? null;
  const [attestations, exported, managedAttestation] = reviewCase
    ? await Promise.all([
        listAttestations(reviewCase.id).catch(() => []),
        getReviewExport(reviewCase.id).catch(() => null),
        getManagedAttestationStatus(reviewCase.id).catch(() => ({
          configured: false,
          deployment: null,
          submission: null,
        })),
      ])
    : [[], null, { configured: false, deployment: null, submission: null }];

  if (reviewCase?.status === "completed" && !exported) {
    return (
      <>
        <OperationalPageHeader
          eyebrow="Review workspace"
          summary="Investigate consequential decisions with clear evidence, policy context, and accountable human judgment."
          title="Review cases with confidence."
        />
        <section className="content-panel service-state" role="alert">
          <p className="eyebrow">Commitment verification blocked</p>
          <h2>The completed case commitment is unavailable.</h2>
          <p>
            Hollis cannot present this completed record until its policy, evidence, and canonical
            commitment are verified. Refresh to retry or contact an administrator if this persists.
          </p>
        </section>
      </>
    );
  }

  return (
    <>
      <OperationalPageHeader
        eyebrow="Review workspace"
        summary="Investigate consequential decisions with clear evidence, policy context, and accountable human judgment."
        title="Review cases with confidence."
      />
      {query.access === "case-create-restricted" ? (
        <aside className="review-access-notice" role="status">
          <strong>Read-only review access</strong>
          <span>Your workspace role cannot create review cases.</span>
        </aside>
      ) : null}
      {reviewCase && exported ? (
        <section className="reference-dashboard">
          <CaseQueue
            canCreate={canCreate}
            cases={queue}
            query={query}
            selectedId={reviewCase.id}
            totalCount={riskCases.length}
          />
          <SelectedCaseWorkspace
            attestations={attestations}
            canCreate={canCreate}
            canReview={canReview}
            exported={exported}
            managedAttestation={managedAttestation}
            query={query}
            reviewCase={reviewCase}
            reviewer={reviewer}
          />
        </section>
      ) : (
        <ReviewEmptyState
          canCreate={canCreate}
          filtered={Boolean(query.risk || (query.status && query.status !== "active"))}
        />
      )}
    </>
  );
}
