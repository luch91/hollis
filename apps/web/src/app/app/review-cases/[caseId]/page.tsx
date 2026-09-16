import Link from "next/link";
import { notFound } from "next/navigation";
import { readHollisSession } from "@/lib/hollis-session";
import { OperationalPageHeader } from "../../operational-page-header";
import { canCreateReviewCases, canPerformHumanReview } from "../../workspace-capabilities";
import { claimAction, decideAction, escalateAction, uploadEvidenceAction } from "../actions";
import { AttestationHorizon, CaseRecordOverview } from "../attestation-visuals";
import {
  getManagedAttestationStatus,
  getReviewCase,
  listAttestations,
  listPublicAttestationCaseFiles,
} from "../data";
import { ManagedAttestationRefresh } from "../managed-attestation-refresh";
import { keyEvidenceRecords } from "../review-presentation";

export default async function ReviewCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { caseId } = await params;
  await searchParams;
  const session = await readHollisSession();
  const activeRole = session?.session.activeWorkspace?.role ?? "";
  const canCreate = canCreateReviewCases(activeRole);
  const canReview = canPerformHumanReview(activeRole);
  let reviewCase: Awaited<ReturnType<typeof getReviewCase>>;
  try {
    reviewCase = await getReviewCase(caseId);
  } catch {
    notFound();
  }
  const [attestations, publicCaseFileResult, managedAttestation] = await Promise.all([
    listAttestations(caseId).catch(() => []),
    listPublicAttestationCaseFiles(caseId)
      .then((caseFiles) => ({ caseFiles, available: true }))
      .catch(() => ({ caseFiles: [], available: false })),
    getManagedAttestationStatus(caseId).catch(() => ({
      configured: false,
      deployment: null,
      submission: null,
    })),
  ]);
  const publicCaseFiles = publicCaseFileResult.caseFiles;
  const managedPending =
    managedAttestation.deployment?.status === "submitted" ||
    managedAttestation.submission?.status === "submitted" ||
    managedAttestation.submission?.status === "submitting";
  const managedPublicCaseFile = publicCaseFiles.find(
    (item) => item.publicCaseFileUrl === managedAttestation.submission?.publicCaseFileUrl,
  );
  const isDemoCase = reviewCase.externalReference.startsWith("DEMO-");

  return (
    <div className="review-case-page" data-demo-content={isDemoCase ? "true" : undefined}>
      <OperationalPageHeader
        eyebrow="Review workspace"
        summary="Investigate consequential decisions with clear evidence, policy context, and accountable human judgment."
        title="Review cases with confidence."
      />
      <section className="content case-detail" aria-labelledby="case-title">
        <div className="detail-toolbar">
          <Link className="back-link" href={`/app/review-cases?caseId=${caseId}`}>
            Back to case workspace
          </Link>
          <nav aria-label="Case actions and export formats" className="detail-export-links">
            {canCreate ? (
              <a className="detail-add-evidence" href="#add-evidence">
                Add evidence
              </a>
            ) : null}
            <a href={`/app/review-cases/${caseId}/export?format=json`}>JSON</a>
            <a href={`/app/review-cases/${caseId}/export?format=md`}>MD</a>
            <a href={`/app/review-cases/${caseId}/export?format=docx`}>DOCX</a>
            <a href={`/app/review-cases/${caseId}/export?format=pdf`}>PDF</a>
          </nav>
        </div>
        <header className="detail-hero">
          <p className="eyebrow">{reviewCase.status.replace("_", " ")}</p>
          <h1 id="case-title">{reviewCase.externalReference}</h1>
          <p className="case-reference-label">Hollis case {reviewCase.hollisCaseReference}</p>
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
            <CaseRecordOverview
              decisionOutcome={reviewCase.decisionOutcome}
              evidenceCount={reviewCase.evidence.length}
              policyLabel={`${reviewCase.policyVersion} / ${reviewCase.ruleId}`}
              recommendation={reviewCase.recommendation}
              status={reviewCase.status}
            />
            <div className="evidence-panel">
              <h2>Evidence references</h2>
              {keyEvidenceRecords(reviewCase.evidence).map(({ key, record: evidence }) => (
                <p key={key}>
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
            <AttestationHorizon
              attestations={attestations}
              managedSubmission={managedAttestation.submission}
              reviewCase={reviewCase}
            />
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
            policy control into a privacy-preserving case commitment for GenLayer adjudication. No
            reviewer wallet, Studio action, or transaction hash is required.
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
          <ManagedAttestationRefresh active={managedPending} />
          {!managedAttestation.configured ? (
            <p className="attestation-notice">
              Managed GenLayer attestation is not configured for this environment.
            </p>
          ) : managedAttestation.submission ? (
            <div className="attestation-success" role="status">
              <div>
                <p className="eyebrow">Hollis-managed attestation</p>
                <strong>
                  {managedAttestation.submission.status === "finalized"
                    ? `GenLayer verdict: ${managedAttestation.submission.verdict?.replaceAll("_", " ") ?? "recorded"}`
                    : `GenLayer ${managedAttestation.submission.status.replaceAll("_", " ")}`}
                </strong>
                <span>{managedAttestation.submission.caseCommitment}</span>
              </div>
              {managedPublicCaseFile ? (
                <Link
                  className="secondary-action"
                  href={`/app/review-cases/${caseId}/attestation-case-files/${managedPublicCaseFile.publicId}`}
                >
                  View attestation record
                </Link>
              ) : null}
            </div>
          ) : reviewCase.status === "completed" ? (
            <p className="attestation-notice">
              Hollis is preparing the policy-bound GenLayer control. This case will submit
              automatically once the control is active.
            </p>
          ) : (
            <p className="attestation-notice">
              Complete the case and record the human decision to start attestation automatically.
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
                        <Link
                          href={`/app/review-cases/${caseId}/attestation-case-files/${publicCaseFile.publicId}`}
                        >
                          View attestation record
                        </Link>
                      </dd>
                    </div>
                    <div>
                      <dt>Canonical record</dt>
                      <dd>
                        <a href={publicCaseFile.publicCaseFileUrl} target="_blank" rel="noreferrer">
                          Open JSON
                        </a>
                      </dd>
                    </div>
                    <div>
                      <dt>Policy control</dt>
                      <dd>{publicCaseFile.caseFile.policy.control.controlId}</dd>
                    </div>
                  </dl>
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
                </article>
              ))}
            </div>
          ) : null}
        </section>
        {canCreate ? (
          <section className="detail-evidence-upload" id="add-evidence">
            <div>
              <p className="eyebrow">Controlled evidence</p>
              <h2>Add evidence</h2>
              <p>
                Files are integrity checked and stored outside the public attestation record.
                Maximum file size is 5 MB.
              </p>
            </div>
            <form action={uploadEvidenceAction}>
              <input name="caseId" type="hidden" value={caseId} />
              <label htmlFor="evidence-file">Select evidence file</label>
              <input id="evidence-file" name="file" required type="file" />
              <button type="submit">Upload and verify evidence</button>
            </form>
          </section>
        ) : null}
        {canReview && (reviewCase.status === "pending" || reviewCase.status === "escalated") ? (
          <form action={claimAction}>
            <input name="caseId" type="hidden" value={caseId} />
            <button className="primary-action" type="submit">
              Claim for review
            </button>
          </form>
        ) : null}
        {canReview && reviewCase.status === "in_review" ? (
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
    </div>
  );
}
