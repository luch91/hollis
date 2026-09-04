import Link from "next/link";
import { notFound } from "next/navigation";
import {
  claimAction,
  createAttestationAction,
  decideAction,
  escalateAction,
  uploadEvidenceAction,
  refreshAttestationAction,
} from "../actions";
import { getReviewCase, listAttestations } from "../data";

export default async function ReviewCasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  let reviewCase: Awaited<ReturnType<typeof getReviewCase>>;
  try {
    reviewCase = await getReviewCase(caseId);
  } catch {
    notFound();
  }
  const attestations = await listAttestations(caseId).catch(() => []);

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
      <section className="attestation-panel" aria-labelledby="attestation-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Onchain Justice</p>
            <h2 id="attestation-title">Process attestation</h2>
          </div>
          <span className="queue-count">{attestations.length} recorded</span>
        </div>
        <p className="panel-description">
          Hollis binds the completed human review, managed evidence references, and a declared
          policy control into a privacy-preserving case commitment for GenLayer adjudication.
        </p>
        <dl className="readiness-list">
          <div>
            <dt>Human decision</dt>
            <dd>
              {reviewCase.decisionOutcome
                ? `Recorded: ${reviewCase.decisionOutcome}`
                : "Required before attestation"}
            </dd>
          </div>
          <div>
            <dt>Policy binding</dt>
            <dd>
              {reviewCase.policyVersion} / {reviewCase.ruleId}
            </dd>
          </div>
          <div>
            <dt>Managed evidence</dt>
            <dd>
              {reviewCase.evidence.length} reference{reviewCase.evidence.length === 1 ? "" : "s"}
            </dd>
          </div>
        </dl>
        {reviewCase.status === "completed" ? (
          <form action={createAttestationAction} className="attestation-form">
            <input name="caseId" type="hidden" value={caseId} />
            <h3>Submit declared control</h3>
            <p>
              Provide the approved policy control. The case file URL must expose only the public,
              privacy-reviewed adjudication case file. Do not include source evidence or personal
              data.
            </p>
            <div className="form-grid">
              <label>
                Policy ID
                <input name="policyId" required pattern="[a-z][a-z0-9-]{0,127}" />
              </label>
              <label>
                Policy version
                <input name="policyVersion" required defaultValue={reviewCase.policyVersion} />
              </label>
              <label>
                Control ID
                <input name="controlId" required readOnly value={reviewCase.ruleId} />
              </label>
              <label>
                Control version
                <input name="controlVersion" required />
              </label>
              <label className="form-span">
                Policy document SHA-256 digest
                <input
                  name="policyDocumentDigest"
                  required
                  placeholder="sha256:..."
                  pattern="sha256:[a-f0-9]{64}"
                />
              </label>
              <label className="form-span">
                Public adjudication case file URL
                <input name="publicCaseFileUrl" required type="url" placeholder="https://..." />
              </label>
              <label className="form-span">
                Attestation criterion
                <textarea name="attestationCriterion" required maxLength={1000} />
              </label>
              <label>
                Evidence requirement
                <select defaultValue="verified_reference_required" name="evidenceRequirement">
                  <option value="none">No evidence reference required</option>
                  <option value="reference_required">Evidence reference required</option>
                  <option value="verified_reference_required">
                    Verified evidence reference required
                  </option>
                </select>
              </label>
              <label>
                Interpretation
                <select defaultValue="deterministic" name="interpretation">
                  <option value="deterministic">Deterministic process check</option>
                  <option value="judgment_required">Judgment required</option>
                </select>
              </label>
            </div>
            <button type="submit">Submit to GenLayer</button>
          </form>
        ) : (
          <p className="attestation-notice">
            Complete the case and record the human decision before submitting an attestation.
          </p>
        )}
        {attestations.length > 0 ? (
          <div className="attestation-records">
            <h3>Recorded attestations</h3>
            {attestations.map((attestation) => (
              <article key={attestation.id} className="attestation-record">
                <div>
                  <p className="eyebrow">{attestation.status}</p>
                  <strong>{attestation.verdict ?? "Verdict pending"}</strong>
                </div>
                <dl>
                  <div>
                    <dt>Submission</dt>
                    <dd>{attestation.providerSubmissionId}</dd>
                  </div>
                  <div>
                    <dt>Commitment</dt>
                    <dd>{attestation.caseCommitment}</dd>
                  </div>
                  {attestation.transactionHash ? (
                    <div>
                      <dt>Transaction</dt>
                      <dd>{attestation.transactionHash}</dd>
                    </div>
                  ) : null}
                </dl>
                <form action={refreshAttestationAction}>
                  <input name="caseId" type="hidden" value={caseId} />
                  <input name="attestationId" type="hidden" value={attestation.id} />
                  <button className="secondary-action" type="submit">
                    Refresh status
                  </button>
                </form>
              </article>
            ))}
          </div>
        ) : null}
      </section>
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
