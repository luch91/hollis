import Link from "next/link";
import { notFound } from "next/navigation";
import { claimAction, decideAction, escalateAction, uploadEvidenceAction } from "../actions";
import { getReviewCase } from "../data";

export default async function ReviewCasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  let reviewCase: Awaited<ReturnType<typeof getReviewCase>>;
  try {
    reviewCase = await getReviewCase(caseId);
  } catch {
    notFound();
  }

  return (
    <section className="content case-detail" aria-labelledby="case-title">
      <Link className="back-link" href="/app">
        Back to queue
      </Link>
      <p className="eyebrow">{reviewCase.status.replace("_", " ")}</p>
      <h1 id="case-title">{reviewCase.externalReference}</h1>
      <div className="case-summary">
        <span className={`risk risk-${reviewCase.riskLevel}`}>{reviewCase.riskLevel} risk</span>
        <span>Recommendation: {reviewCase.recommendation}</span>
        <span>Policy {reviewCase.policyVersion}</span>
        <span>Rule {reviewCase.ruleId}</span>
      </div>
      <div className="evidence-panel">
        <h2>Evidence references</h2>
        {reviewCase.evidence.map((evidence) => (
          <p key={evidence.id}>
            {evidence.id} · {evidence.mediaType} · {evidence.digest}
          </p>
        ))}
      </div>
      <p>
        <a className="secondary-action" href={`/app/review-cases/${caseId}/export`}>
          Export case record
        </a>
      </p>
      <form action={uploadEvidenceAction}>
        <input name="caseId" type="hidden" value={caseId} />
        <label htmlFor="evidence-file">Add evidence (maximum 5 MB)</label>
        <input id="evidence-file" name="file" required type="file" />
        <button type="submit">Upload and verify evidence</button>
      </form>
      {reviewCase.status === "pending" || reviewCase.status === "escalated" ? (
        <form action={claimAction}>
          <input name="caseId" type="hidden" value={caseId} />
          <button className="primary-action" type="submit">
            Claim for review
          </button>
        </form>
      ) : null}
      {reviewCase.status === "in_review" ? (
        <div className="action-grid">
          <form action={escalateAction} className="action-card">
            <input name="caseId" type="hidden" value={caseId} />
            <h2>Escalate</h2>
            <label htmlFor="reason">Reason</label>
            <textarea id="reason" name="reason" required />
            <button type="submit">Escalate case</button>
          </form>
          <form action={decideAction} className="action-card">
            <input name="caseId" type="hidden" value={caseId} />
            <h2>Record decision</h2>
            <label htmlFor="outcome">Outcome</label>
            <select defaultValue="approved" id="outcome" name="outcome">
              <option value="approved">Approved</option>
              <option value="modified">Modified</option>
              <option value="rejected">Rejected</option>
            </select>
            <label htmlFor="finalRecommendation">Final recommendation</label>
            <select
              defaultValue={reviewCase.recommendation}
              id="finalRecommendation"
              name="finalRecommendation"
            >
              <option value="approve">Approve</option>
              <option value="deny">Deny</option>
              <option value="partial_approve">Partial approve</option>
              <option value="investigate">Investigate</option>
              <option value="refer">Refer</option>
            </select>
            <label htmlFor="rationale">Rationale</label>
            <textarea id="rationale" name="rationale" required />
            <button type="submit">Record human decision</button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
