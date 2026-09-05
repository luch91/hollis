import Link from "next/link";
import { notFound } from "next/navigation";
import {
  claimAction,
  createPublicAttestationCaseFileAction,
  decideAction,
  escalateAction,
  importFinalizedAttestationAction,
  uploadEvidenceAction,
  refreshAttestationAction,
} from "../actions";
import { getReviewCase, listAttestations, listPublicAttestationCaseFiles } from "../data";
import { AttestationHorizon, EvidenceFlow } from "../attestation-visuals";

export default async function ReviewCasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  let reviewCase: Awaited<ReturnType<typeof getReviewCase>>;
  try {
    reviewCase = await getReviewCase(caseId);
  } catch {
    notFound();
  }
  const [attestations, publicCaseFileResult] = await Promise.all([
    listAttestations(caseId).catch(() => []),
    listPublicAttestationCaseFiles(caseId)
      .then((caseFiles) => ({ caseFiles, available: true }))
      .catch(() => ({ caseFiles: [], available: false })),
  ]);
  const publicCaseFiles = publicCaseFileResult.caseFiles;

  return (
    <section className="content case-detail" aria-labelledby="case-title">
      <div className="detail-toolbar">
        <Link className="back-link" href={`/app?caseId=${caseId}`}>
          Back to case workspace
        </Link>
        <nav aria-label="Case actions and export formats" className="detail-export-links">
          <a className="detail-add-evidence" href="#add-evidence">
            Add evidence
          </a>
          <a href={`/app/review-cases/${caseId}/export?format=json`}>JSON</a>
          <a href={`/app/review-cases/${caseId}/export?format=md`}>MD</a>
          <a href={`/app/review-cases/${caseId}/export?format=docx`}>DOCX</a>
          <a href={`/app/review-cases/${caseId}/export?format=pdf`}>PDF</a>
        </nav>
      </div>
      <header className="detail-hero">
        <p className="eyebrow">{reviewCase.status.replace("_", " ")}</p>
        <h1 id="case-title">{reviewCase.externalReference}</h1>
        <p>
          Detailed review record, evidence trace, policy binding, human action, and attestation
          controls.
        </p>
      </header>
      <div className="case-summary">
        <span className={`risk risk-${reviewCase.riskLevel}`}>{reviewCase.riskLevel} risk</span>
        <span>Recommendation: {reviewCase.recommendation}</span>
        <span>Policy {reviewCase.policyVersion}</span>
        <span>Rule {reviewCase.ruleId}</span>
      </div>
      <div className="case-workspace-grid">
        <div className="case-workspace-main">
          <EvidenceFlow
            decisionOutcome={reviewCase.decisionOutcome}
            evidenceCount={reviewCase.evidence.length}
            policyLabel={`${reviewCase.policyVersion} / ${reviewCase.ruleId}`}
            recommendation={reviewCase.recommendation}
            status={reviewCase.status}
          />
          <div className="evidence-panel">
            <h2>Evidence references</h2>
            {reviewCase.evidence.map((evidence) => (
              <p key={evidence.id}>
                {evidence.id} · {evidence.mediaType} · {evidence.digest}
              </p>
            ))}
          </div>
        </div>
        <div className="case-workspace-side">
          <div className="detail-horizon-heading">
            <p className="eyebrow">Process state</p>
            <h2>Attestation Horizon</h2>
            <p>Evidence layers align with the human decision and portable receipt.</p>
          </div>
          <AttestationHorizon attestations={attestations} reviewCase={reviewCase} />
        </div>
      </div>
      <section className="attestation-panel" aria-labelledby="attestation-title" id="attestation">
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
              {reviewCase.evidence.length} reference
              {reviewCase.evidence.length === 1 ? "" : "s"}
            </dd>
          </div>
        </dl>
        {reviewCase.status === "completed" && publicCaseFileResult.available ? (
          <form action={createPublicAttestationCaseFileAction} className="attestation-form">
            <input name="caseId" type="hidden" value={caseId} />
            <h3>Generate controlled case file</h3>
            <p>
              Provide the approved policy control. Hollis will generate an immutable, public-safe
              case file containing only the process facts required by GenLayer. Raw evidence and
              personal data remain private.
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
            <button type="submit">Generate case file</button>
          </form>
        ) : reviewCase.status === "completed" ? (
          <p className="attestation-notice">
            The controlled public case-file publisher is not configured for this environment.
          </p>
        ) : (
          <p className="attestation-notice">
            Complete the case and record the human decision before submitting an attestation.
          </p>
        )}
        {publicCaseFiles.length > 0 ? (
          <div className="attestation-records">
            <h3>Generated case files</h3>
            {publicCaseFiles.map((publicCaseFile) => (
              <article key={publicCaseFile.publicId} className="attestation-record">
                <div>
                  <p className="eyebrow">Public-safe case file</p>
                  <strong>{publicCaseFile.caseFile.caseCommitment}</strong>
                </div>
                <dl>
                  <div>
                    <dt>Case file</dt>
                    <dd>
                      <a href={publicCaseFile.publicCaseFileUrl} target="_blank" rel="noreferrer">
                        Open generated file
                      </a>
                    </dd>
                  </div>
                  <div>
                    <dt>Policy control</dt>
                    <dd>{publicCaseFile.caseFile.policy.control.controlId}</dd>
                  </div>
                </dl>
                <form action={importFinalizedAttestationAction} className="attestation-form">
                  <input name="caseId" type="hidden" value={caseId} />
                  <input name="publicCaseFileId" type="hidden" value={publicCaseFile.publicId} />
                  <label>
                    Finalized GenLayer transaction hash
                    <input
                      name="transactionHash"
                      required
                      pattern="0x[a-fA-F0-9]{64}"
                      placeholder="0x..."
                    />
                  </label>
                  <button className="secondary-action" type="submit">
                    Verify and import finalized attestation
                  </button>
                </form>
              </article>
            ))}
          </div>
        ) : null}
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
      <section className="detail-evidence-upload" id="add-evidence">
        <div>
          <p className="eyebrow">Controlled evidence</p>
          <h2>Add evidence</h2>
          <p>
            Files are integrity checked and stored outside the public attestation record. Maximum
            file size is 5 MB.
          </p>
        </div>
        <form action={uploadEvidenceAction}>
          <input name="caseId" type="hidden" value={caseId} />
          <label htmlFor="evidence-file">Select evidence file</label>
          <input id="evidence-file" name="file" required type="file" />
          <button type="submit">Upload and verify evidence</button>
        </form>
      </section>
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
