import type { CSSProperties } from "react";
import type { AttestationRecord, ReviewCaseDetail } from "./data";

type CaseRecordOverviewProps = {
  decisionOutcome: string | null;
  evidenceCount: number;
  policyLabel: string;
  recommendation: string;
  status: string;
};

export function CaseRecordOverview({
  decisionOutcome,
  evidenceCount,
  policyLabel,
  recommendation,
  status,
}: CaseRecordOverviewProps) {
  const reviewStatus = decisionOutcome
    ? `Recorded outcome: ${decisionOutcome.replaceAll("_", " ")}`
    : status === "escalated"
      ? "Escalated for additional review"
      : status === "in_review"
        ? "Review in progress"
        : "Awaiting a recorded outcome";
  return (
    <section className="case-record-overview" aria-labelledby="case-record-overview-title">
      <div className="case-record-overview-heading">
        <div>
          <p className="eyebrow">Decision trace</p>
          <h2 id="case-record-overview-title">Evidence, policy, and review in one record.</h2>
        </div>
        <span className="live-indicator">Live case view</span>
      </div>
      <div className="case-record-overview-grid">
        <article>
          <span>01</span>
          <strong>Evidence references</strong>
          <small>
            {evidenceCount} managed reference{evidenceCount === 1 ? "" : "s"}
          </small>
        </article>
        <article>
          <span>02</span>
          <strong>System decision</strong>
          <small>{recommendation.replaceAll("_", " ")}</small>
        </article>
        <article>
          <span>03</span>
          <strong>Policy binding</strong>
          <small>{policyLabel}</small>
        </article>
        <article className="case-record-human-review">
          <span>04</span>
          <strong>Human judgment</strong>
          <small>{reviewStatus}</small>
        </article>
      </div>
    </section>
  );
}

function attestationState(attestations: AttestationRecord[]) {
  const latest = attestations.at(0);
  if (!latest) return { label: "Pending", tone: "pending" };
  if (latest.status === "finalized" && latest.verdict) {
    return { label: latest.verdict.replaceAll("_", " "), tone: latest.verdict };
  }
  return { label: latest.status.replaceAll("_", " "), tone: "pending" };
}

export function AttestationHorizon({
  reviewCase,
  attestations,
}: {
  reviewCase: ReviewCaseDetail;
  attestations: AttestationRecord[];
}) {
  const finalState = attestationState(attestations);
  const reviewState = reviewCase.decisionOutcome ? "Recorded" : "Awaiting";

  const stages = [
    {
      detail: `${reviewCase.evidence.length} managed reference${reviewCase.evidence.length === 1 ? "" : "s"}`,
      label: "Evidence references",
      state: reviewCase.evidence.length > 0 ? "Available" : "Awaiting",
      tone: reviewCase.evidence.length > 0 ? "ready" : "pending",
    },
    {
      detail: reviewCase.automatedSystemVersion,
      label: "System decision",
      state: "Recorded",
      tone: "ready",
    },
    {
      detail: `${reviewCase.policyVersion} / ${reviewCase.ruleId}`,
      label: "Policy alignment",
      state: "Bound",
      tone: "ready",
    },
    {
      detail: reviewCase.decisionOutcome ?? "A reviewer decision is required",
      label: "Human review",
      state: reviewState,
      tone: reviewCase.decisionOutcome ? "ready" : "pending",
    },
  ];

  return (
    <section className="attestation-horizon" aria-label="Attestation progression">
      <ol className="horizon-stages">
        {stages.map((stage, index) => (
          <li
            className="horizon-stage"
            key={stage.label}
            style={{ "--stage": index } as CSSProperties}
          >
            <span className="stage-number">0{index + 1}</span>
            <div>
              <strong>{stage.label}</strong>
              <small>{stage.detail}</small>
            </div>
            <span className={`stage-state stage-state-${stage.tone}`}>{stage.state}</span>
          </li>
        ))}
      </ol>
      <div className="horizon-receipt">
        <span className="stage-number">05</span>
        <div>
          <p>Final receipt</p>
          <strong>{finalState.label}</strong>
        </div>
        <span className={`receipt-state receipt-state-${finalState.tone}`}>{finalState.label}</span>
      </div>
    </section>
  );
}
