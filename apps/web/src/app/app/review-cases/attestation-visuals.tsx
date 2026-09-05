import type { AttestationRecord, ReviewCaseDetail } from "./data";
import type { CSSProperties } from "react";

type EvidenceFlowProps = {
  decisionOutcome: string | null;
  evidenceCount: number;
  policyLabel: string;
  recommendation: string;
  status: string;
};

export function EvidenceFlow({
  decisionOutcome,
  evidenceCount,
  policyLabel,
  recommendation,
  status,
}: EvidenceFlowProps) {
  const reviewStatus = decisionOutcome
    ? `Recorded outcome: ${decisionOutcome.replaceAll("_", " ")}`
    : status === "escalated"
      ? "Escalated for additional review"
      : status === "in_review"
        ? "Review in progress"
        : "Awaiting a recorded outcome";
  return (
    <section className="evidence-flow" aria-labelledby="evidence-flow-title">
      <div className="flow-heading">
        <div>
          <p className="eyebrow">Decision trace</p>
          <h2 id="evidence-flow-title">Evidence, policy, and review in one record.</h2>
        </div>
        <span className="live-indicator">Live case view</span>
      </div>
      <div className="flow-canvas">
        <svg
          aria-hidden="true"
          className="flow-lines"
          viewBox="0 0 760 280"
          preserveAspectRatio="none"
        >
          <path className="flow-path flow-path-one" d="M92 55 C210 55 217 140 346 140" />
          <path className="flow-path flow-path-two" d="M92 140 C202 140 218 140 346 140" />
          <path className="flow-path flow-path-three" d="M92 225 C215 225 222 140 346 140" />
          <path className="flow-path flow-path-output" d="M445 140 C535 140 541 82 662 82" />
          <path className="flow-path flow-path-output" d="M445 140 C535 140 541 198 662 198" />
          <circle className="flow-signal flow-signal-one" cx="218" cy="96" r="4" />
          <circle className="flow-signal flow-signal-two" cx="267" cy="140" r="4" />
          <circle className="flow-signal flow-signal-three" cx="519" cy="122" r="4" />
          <circle className="flow-signal flow-signal-four" cx="574" cy="169" r="4" />
        </svg>
        <div className="flow-node flow-node-source flow-node-a">
          <span className="flow-node-index">01</span>
          <strong>Evidence references</strong>
          <small>
            {evidenceCount} managed reference{evidenceCount === 1 ? "" : "s"}
          </small>
        </div>
        <div className="flow-node flow-node-source flow-node-b">
          <span className="flow-node-index">02</span>
          <strong>System decision</strong>
          <small>{recommendation.replaceAll("_", " ")}</small>
        </div>
        <div className="flow-node flow-node-source flow-node-c">
          <span className="flow-node-index">03</span>
          <strong>Policy binding</strong>
          <small>{policyLabel}</small>
        </div>
        <div className="flow-node flow-node-decision">
          <span className="flow-node-label">Review record</span>
          <strong>Human judgment</strong>
          <span className="flow-node-status">{reviewStatus}</span>
        </div>
        <div className="flow-node flow-node-output flow-node-output-top">
          <span className="flow-node-index">04</span>
          <strong>Review action</strong>
          <small>Claim, decide, or escalate</small>
        </div>
        <div className="flow-node flow-node-output flow-node-output-bottom">
          <span className="flow-node-index">05</span>
          <strong>Attestation receipt</strong>
          <small>Available after completion</small>
        </div>
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
        <span className="receipt-lock" aria-hidden="true">
          ◇
        </span>
        <div>
          <p>Final receipt</p>
          <strong>{finalState.label}</strong>
        </div>
        <span className={`receipt-state receipt-state-${finalState.tone}`}>{finalState.label}</span>
      </div>
    </section>
  );
}

export function QueueHorizon() {
  return (
    <aside className="queue-horizon" aria-labelledby="queue-horizon-title">
      <p className="eyebrow">Attestation horizon</p>
      <h2 id="queue-horizon-title">A case becomes a portable process record.</h2>
      <div className="queue-horizon-track" aria-hidden="true">
        <span className="queue-orb queue-orb-one" />
        <span className="queue-orb queue-orb-two" />
        <span className="queue-orb queue-orb-three" />
        <span className="queue-track-line" />
      </div>
      <ol className="queue-horizon-list">
        <li>Evidence references are managed in the review record.</li>
        <li>A reviewer records the final outcome or escalates the case.</li>
        <li>A completed process can produce a public-safe attestation file.</li>
      </ol>
    </aside>
  );
}
