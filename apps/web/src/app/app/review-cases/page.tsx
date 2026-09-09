import Link from "next/link";
import type { CSSProperties } from "react";
import type { ReviewExport } from "@hollis/contracts/review-case";
import { readHollisSession } from "@/lib/hollis-session";
import { claimAction, decideAction, escalateAction } from "./actions";
import {
  getReviewCase,
  getReviewExport,
  listAttestations,
  listReviewCases,
  ReviewServiceError,
  type AttestationRecord,
  type ReviewCaseDetail,
  type ReviewQueueItem,
} from "./data";

type ReviewerProfile = {
  email: string;
  id: string;
  imageUrl: string | null;
  name: string;
};

type WorkspaceQuery = {
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
  return `/app?${parameters.toString()}`;
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

function CaseQueue({
  cases,
  query,
  selectedId,
}: {
  cases: ReviewQueueItem[];
  query: WorkspaceQuery;
  selectedId?: string;
}) {
  const filtersActive = Boolean(query.risk || query.status);
  return (
    <aside className="reference-queue">
      <div className="reference-queue-heading">
        <div>
          <h1>
            Active Cases <span>{cases.length}</span>
          </h1>
          <Link className="new-review-case-link" href="/app/review-cases/new">
            New review case
          </Link>
        </div>
        <details className="queue-filter-menu" open={filtersActive}>
          <summary aria-label="Queue filters">☷</summary>
          <form action="/app" method="get">
            <input name="caseId" type="hidden" value={selectedId ?? ""} />
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
              <Link href="/app">Reset</Link>
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
                <strong>{item.externalReference}</strong>
                <small>{item.recommendation.replaceAll("_", " ")}</small>
                <em className={`queue-state queue-state-${item.status}`}>
                  {item.status.replaceAll("_", " ")}
                </em>
              </span>
              <span>
                <small>{shortId(item.id)}</small>
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

function DecisionGraph({ reviewCase }: { reviewCase: ReviewCaseDetail }) {
  const evidence = reviewCase.evidence.slice(0, 6);
  const sourceSlots = evidence.length
    ? evidence
    : [{ digest: "", id: "No evidence recorded", mediaType: "Awaiting evidence" }];
  return (
    <div className="reference-graph" id="evidence" aria-label="Decision evidence graph" role="img">
      <p className="graph-label graph-label-source">Source evidence</p>
      <p className="graph-label graph-label-policy">Policy references</p>
      <svg aria-hidden="true" viewBox="0 0 660 430" preserveAspectRatio="none">
        {sourceSlots.map((item, index) => (
          <path
            className="graph-line graph-line-valid"
            d={`M145 ${69 + index * 54} C210 ${69 + index * 54} 190 210 252 210`}
            key={`source-${item.id}`}
            style={{ "--line-index": index } as CSSProperties}
          />
        ))}
        <path className="graph-line graph-line-valid" d="M390 210 C437 210 420 95 465 95" />
        <path className="graph-line graph-line-warning" d="M390 210 C437 210 420 214 465 214" />
        <path className="graph-line graph-line-valid" d="M390 210 C437 210 420 333 465 333" />
      </svg>
      <div className="source-nodes">
        {sourceSlots.map((item, index) => (
          <article
            className="graph-card source-card"
            key={item.id}
            style={{ "--node-index": index } as CSSProperties}
          >
            <span className="source-icon" aria-hidden="true">
              ▱
            </span>
            <div>
              <strong>{item.id}</strong>
              <small>{item.mediaType}</small>
              <small>{item.digest ? shortId(item.digest) : "No integrity digest"}</small>
            </div>
            <span className="node-check" aria-label="Reference recorded" role="img">
              ✓
            </span>
          </article>
        ))}
      </div>
      <article className="graph-card model-card">
        <div className="model-card-heading">
          <span>Model output</span>
          <small>{formatDate(reviewCase.createdAt, true)}</small>
        </div>
        <div className="model-primary">
          <div>
            <small>Decision</small>
            <strong>
              <i />
              {reviewCase.recommendation.replaceAll("_", " ")}
            </strong>
          </div>
          <div>
            <small>Risk</small>
            <strong>{reviewCase.riskLevel}</strong>
          </div>
        </div>
        <div className="factor-list">
          <small>Recorded decision context</small>
          <p>
            <span>Policy trigger</span>
            <i aria-hidden="true" />
          </p>
          <p>
            <span>Risk classification</span>
            <i aria-hidden="true" />
          </p>
          <p>
            <span>Review requirement</span>
            <i aria-hidden="true" />
          </p>
        </div>
        <div className="model-alert">
          ● Human review required <small>See {reviewCase.ruleId}</small>
        </div>
      </article>
      <div className="policy-nodes">
        <article className="graph-card policy-card">
          <span>POLICY</span>
          <strong>{reviewCase.policyVersion}</strong>
          <p>Policy version bound to this review case.</p>
          <small>Recorded binding</small>
        </article>
        <article className="graph-card policy-card policy-exception">
          <span>CONTROL</span>
          <strong>{reviewCase.ruleId}</strong>
          <p>The rule that triggered or governs human review.</p>
          <small>View control</small>
        </article>
        <article className="graph-card policy-card">
          <span>GUARDRAIL</span>
          <strong>Human decision</strong>
          <p>An automated recommendation cannot execute a consequential action alone.</p>
          <small>Mandatory</small>
        </article>
      </div>
      <div className="reviewer-notes" id="communications">
        <div>
          <span>Reviewer notes</span>
          <small>
            {[reviewCase.escalationReason, reviewCase.decisionRationale].filter(Boolean).length}
          </small>
        </div>
        {reviewCase.escalationReason ? (
          <article>
            <span className="note-avatar">E</span>
            <div>
              <strong>Escalation</strong>
              <small>{formatDate(reviewCase.escalatedAt, true)}</small>
              <p>{reviewCase.escalationReason}</p>
            </div>
          </article>
        ) : null}
        {reviewCase.decisionRationale ? (
          <article>
            <span className="note-avatar">R</span>
            <div>
              <strong>Decision rationale</strong>
              <small>{formatDate(reviewCase.decidedAt, true)}</small>
              <p>{reviewCase.decisionRationale}</p>
            </div>
          </article>
        ) : null}
        {!reviewCase.escalationReason && !reviewCase.decisionRationale ? (
          <article>
            <span className="note-avatar">R</span>
            <div>
              <strong>No note recorded</strong>
              <p>Reviewer rationale will appear here when the case is decided or escalated.</p>
            </div>
          </article>
        ) : null}
      </div>
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

function CaseEvidencePanel({ reviewCase }: { reviewCase: ReviewCaseDetail }) {
  return (
    <section className="case-tab-panel case-evidence-panel" aria-labelledby="evidence-panel-title">
      <div className="case-tab-panel-heading">
        <div>
          <span>Managed evidence</span>
          <h3 id="evidence-panel-title">Evidence references</h3>
        </div>
        <Link href={`/app/review-cases/${reviewCase.id}#add-evidence`}>Add evidence</Link>
      </div>
      {reviewCase.evidence.length > 0 ? (
        <div className="case-tab-records">
          {reviewCase.evidence.map((evidence, index) => (
            <article key={evidence.id}>
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
  reviewCase,
  reviewer,
}: {
  reviewCase: ReviewCaseDetail;
  reviewer: ReviewerProfile;
}) {
  const needsClaim = reviewCase.status === "pending" || reviewCase.status === "escalated";
  const isAssignedReviewer = reviewCase.assignedToUserId === reviewer.id;
  const assigneeName = isAssignedReviewer
    ? reviewer.name
    : reviewCase.assignedToUserId
      ? shortId(reviewCase.assignedToUserId)
      : "Unassigned";
  return (
    <section className="human-review-card">
      <div className="human-review-title">
        <h2>Human Review</h2>
        <span className={`review-state review-state-${reviewCase.status}`}>
          {reviewCase.status.replaceAll("_", " ")}
        </span>
      </div>
      <p>
        Review the evidence references and confirm the outcome against the recorded policy control.
      </p>
      <div className="review-assignee">
        <span
          aria-label={isAssignedReviewer ? `${reviewer.name} profile picture` : "Reviewer profile"}
          className="reviewer-avatar"
          role="img"
          style={
            isAssignedReviewer && reviewer.imageUrl
              ? { backgroundImage: `url(${reviewer.imageUrl})` }
              : undefined
          }
        >
          {isAssignedReviewer && reviewer.imageUrl ? null : assigneeName.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <small>Assigned to</small>
          <strong>{assigneeName}</strong>
          {isAssignedReviewer ? <small>{reviewer.email}</small> : null}
        </div>
        <div>
          <small>Due</small>
          <strong>{formatDate(reviewCase.reviewDueAt)}</strong>
        </div>
      </div>
      {needsClaim ? (
        <form action={claimAction} className="review-button-row">
          <input name="caseId" type="hidden" value={reviewCase.id} />
          <button className="reference-primary" type="submit">
            Claim for review <span>›</span>
          </button>
        </form>
      ) : reviewCase.status === "in_review" ? (
        <div className="inline-review-actions">
          <form action={decideAction}>
            <input name="caseId" type="hidden" value={reviewCase.id} />
            <div className="compact-fields">
              <select aria-label="Decision outcome" defaultValue="approved" name="outcome">
                <option value="approved">Approved</option>
                <option value="modified">Modified</option>
                <option value="rejected">Rejected</option>
              </select>
              <select
                aria-label="Final recommendation"
                defaultValue={reviewCase.recommendation}
                name="finalRecommendation"
              >
                <option value="approve">Approve</option>
                <option value="deny">Deny</option>
                <option value="partial_approve">Partial approve</option>
                <option value="investigate">Investigate</option>
                <option value="refer">Refer</option>
              </select>
            </div>
            <textarea
              aria-label="Decision rationale"
              name="rationale"
              placeholder="Record the decision rationale"
              required
            />
            <button className="reference-primary" type="submit">
              Record decision <span>›</span>
            </button>
          </form>
          <form action={escalateAction}>
            <input name="caseId" type="hidden" value={reviewCase.id} />
            <textarea
              aria-label="Escalation reason"
              name="reason"
              placeholder="Reason for escalation"
              required
            />
            <button className="reference-secondary" type="submit">
              Request changes
            </button>
          </form>
        </div>
      ) : (
        <div className="recorded-decision">
          <span>Recorded outcome</span>
          <strong>{reviewCase.decisionOutcome?.replaceAll("_", " ")}</strong>
          <p>{reviewCase.decisionRationale}</p>
        </div>
      )}
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
            <strong>{reviewCase.externalReference}</strong>
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
            <strong>{shortId(reviewCase.id)}</strong>
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
            <strong>{reviewCase.externalReference}</strong>
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
            <span>Hollis</span>
            <i>H</i>
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
  reviewCase,
  attestations,
  exported,
  reviewer,
  query,
}: {
  reviewCase: ReviewCaseDetail;
  attestations: AttestationRecord[];
  exported: ReviewExport;
  reviewer: ReviewerProfile;
  query: WorkspaceQuery;
}) {
  const tab = activeCaseTab(query.tab);
  return (
    <>
      <section className={`reference-case-workspace view-${query.view ?? "canvas"}`}>
        <header className="reference-case-header">
          <div className="case-kicker">
            <span>{shortId(reviewCase.id)}</span>
            <em className={`queue-state queue-state-${reviewCase.status}`}>
              {reviewCase.status.replaceAll("_", " ")}
            </em>
          </div>
          <h2>{reviewCase.externalReference}</h2>
          <p>{reviewCase.ruleId.replaceAll("_", " ")}</p>
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
          <span>
            <Link
              aria-label="Canvas view"
              className={query.view !== "list" ? "is-active" : undefined}
              href={workspaceHref(query, { view: "canvas" })}
            >
              ⌘
            </Link>
            <Link
              aria-label="List view"
              className={query.view === "list" ? "is-active" : undefined}
              href={workspaceHref(query, { view: "list" })}
            >
              ☷
            </Link>
            <Link aria-label="Expand view" href={`/app/review-cases/${reviewCase.id}`}>
              ↗
            </Link>
          </span>
        </nav>
        {tab === "summary" ? (
          <>
            <div id="case-summary">
              <DecisionGraph reviewCase={reviewCase} />
            </div>
            <HumanReviewPanel reviewCase={reviewCase} reviewer={reviewer} />
          </>
        ) : null}
        {tab === "evidence" ? <CaseEvidencePanel reviewCase={reviewCase} /> : null}
        {tab === "communications" ? <CaseCommunicationsPanel reviewCase={reviewCase} /> : null}
        {tab === "history" ? <CaseHistory exported={exported} /> : null}
      </section>
      <aside className="reference-right-rail">
        <div className="right-rail-heading">
          <div>
            <p className="eyebrow">Independent verification</p>
            <h2>GenLayer</h2>
            <p>Neutral process attestation, separate from the human decision.</p>
          </div>
          <nav className="right-rail-actions" aria-label="Selected case actions">
            <Link href={`/app/review-cases/${reviewCase.id}#add-evidence`}>Add evidence</Link>
            <Link href={`/app/review-cases/${reviewCase.id}`}>View details</Link>
          </nav>
        </div>
        <GenLayerPanel attestations={attestations} reviewCase={reviewCase} />
        <ExportPreview attestations={attestations} reviewCase={reviewCase} />
      </aside>
    </>
  );
}

function GenLayerPanel({
  attestations,
  reviewCase,
}: {
  attestations: AttestationRecord[];
  reviewCase: ReviewCaseDetail;
}) {
  const latest = attestations.at(0);
  const humanDecisionRecorded = reviewCase.decisionOutcome !== null;
  const evidenceReady = reviewCase.evidence.length > 0;
  const ready = humanDecisionRecorded && evidenceReady;
  const status = latest?.status ?? (ready ? "ready" : "not ready");
  return (
    <section className="genlayer-panel" aria-labelledby="genlayer-panel-title">
      <div className={`genlayer-status genlayer-status-${status.replaceAll(" ", "-")}`}>
        <span aria-hidden="true">◉</span>
        <strong>{status}</strong>
      </div>
      <h3 id="genlayer-panel-title">Independent Attestation</h3>
      <p>GenLayer verifies the declared process after Hollis records the human review.</p>
      <ol className="genlayer-readiness">
        <li>
          <span>Policy locked</span>
          <strong>✓</strong>
          <small>
            {reviewCase.policyVersion} / {reviewCase.ruleId}
          </small>
        </li>
        <li>
          <span>Evidence reference</span>
          <strong className={evidenceReady ? "is-ready" : "is-pending"}>
            {evidenceReady ? "✓" : "○"}
          </strong>
          <small>{reviewCase.evidence.length} recorded</small>
        </li>
        <li>
          <span>Human decision</span>
          <strong className={humanDecisionRecorded ? "is-ready" : "is-pending"}>
            {humanDecisionRecorded ? "✓" : "○"}
          </strong>
          <small>{humanDecisionRecorded ? "Recorded" : "Required"}</small>
        </li>
        <li>
          <span>Case commitment</span>
          <strong className={latest ? "is-ready" : "is-pending"}>{latest ? "✓" : "○"}</strong>
          <small>{latest?.caseCommitment ?? "Generated after review"}</small>
        </li>
      </ol>
      <div
        className="genlayer-flow"
        aria-label="Hollis case through GenLayer contract to a portable receipt"
      >
        <span>Hollis case</span>
        <i>›</i>
        <span>GenLayer contract</span>
        <i>›</i>
        <span>Receipt</span>
      </div>
      {latest ? (
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
          {ready ? "Prepare attestation" : "View readiness"} <span>›</span>
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
        <Link className="reference-primary" href="/app">
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
    email: "",
    id: session.session.userId,
    imageUrl: null,
    name: "Workspace member",
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
  const filteredQueue = (
    query.risk ? statusCases.filter((item) => item.riskLevel === query.risk) : statusCases
  ).slice(0, 12);
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
  const [attestations, exported] = reviewCase
    ? await Promise.all([
        listAttestations(reviewCase.id).catch(() => []),
        getReviewExport(reviewCase.id).catch(() => null),
      ])
    : [[], null];

  return (
    <section className="reference-dashboard">
      <CaseQueue cases={queue} query={query} selectedId={reviewCase?.id} />
      {reviewCase && exported ? (
        <SelectedCaseWorkspace
          attestations={attestations}
          exported={exported}
          query={query}
          reviewCase={reviewCase}
          reviewer={reviewer}
        />
      ) : (
        <div className="reference-dashboard-empty">
          <h1>No review cases</h1>
          <p>Start a privacy-safe intake record for a decision that requires human review.</p>
          <Link className="reference-primary" href="/app/review-cases/new">
            Create review case <span>›</span>
          </Link>
        </div>
      )}
    </section>
  );
}
