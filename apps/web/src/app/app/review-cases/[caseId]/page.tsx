import Link from "next/link";
import { notFound } from "next/navigation";
import { readHollisSession } from "@/lib/hollis-session";
import { OperationalPageHeader } from "../../operational-page-header";
import {
  canCreateReviewCases,
  canManageRetention as canManageRetentionForRole,
  canPerformHumanReview,
} from "../../workspace-capabilities";
import {
  claimAction,
  decideAction,
  downloadEvidenceAction,
  escalateAction,
  removeEvidenceAction,
  setEvidenceLegalHoldAction,
} from "../actions";
import { AttestationHorizon, CaseRecordOverview } from "../attestation-visuals";
import {
  getManagedAttestationStatus,
  getReviewCase,
  getReviewExport,
  listEvidenceLifecycle,
  listAttestations,
  listPublicAttestationCaseFiles,
} from "../data";
import { EvidenceUploader } from "../evidence-uploader";
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
  const canManageRetention = canManageRetentionForRole(activeRole);
  let reviewCase: Awaited<ReturnType<typeof getReviewCase>>;
  try {
    reviewCase = await getReviewCase(caseId);
  } catch {
    notFound();
  }
  const [attestations, publicCaseFileResult, managedAttestation, exported, evidenceLifecycle] =
    await Promise.all([
      listAttestations(caseId).catch(() => []),
      listPublicAttestationCaseFiles(caseId)
        .then((caseFiles) => ({ caseFiles, available: true }))
        .catch(() => ({ caseFiles: [], available: false })),
      getManagedAttestationStatus(caseId).catch(() => ({
        configured: false,
        deployment: null,
        submission: null,
      })),
      getReviewExport(caseId).catch(() => null),
      listEvidenceLifecycle(caseId).catch(() => []),
    ]);
  const publicCaseFiles = publicCaseFileResult.caseFiles;
  const auditIntegrity = exported?.auditIntegrity;
  const managedPending =
    managedAttestation.deployment?.status === "submitted" ||
    managedAttestation.submission?.status === "submitted" ||
    managedAttestation.submission?.status === "submitting";
  const managedPublicCaseFile = publicCaseFiles.find(
    (item) => item.publicCaseFileUrl === managedAttestation.submission?.publicCaseFileUrl,
  );
  return (
    <div className="review-case-page">
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
            {canCreate && (reviewCase.status === "draft" || reviewCase.status === "pending") ? (
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
        {exported ? (
          <div className="case-commitment-summary" data-testid="case-commitment-summary">
            <span>
              {exported.canonical
                ? exported.canonical.commitmentVersion
                : "Legacy: hollis.review-export.v1 manifest"}
            </span>
            <code>{exported.canonical?.caseCommitment ?? exported.manifestHash}</code>
          </div>
        ) : null}
        {auditIntegrity?.status === "failed" ? (
          <aside className="attestation-notice" role="alert" data-testid="audit-integrity-incident">
            Audit integrity incident: the exported chain failed{" "}
            {auditIntegrity.failure ?? "verification"}. Attestation is blocked until an authorized
            investigation resolves the record.
          </aside>
        ) : auditIntegrity ? (
          <p className="case-reference-label" data-testid="audit-integrity-status">
            Audit chain verified · {auditIntegrity.eventCount} event
            {auditIntegrity.eventCount === 1 ? "" : "s"} ·{" "}
            {exported.auditCheckpoint
              ? `checkpointed by ${exported.auditCheckpoint.keyId}`
              : "no external checkpoint yet"}
          </p>
        ) : null}
        {!exported && reviewCase.status === "completed" ? (
          <aside className="attestation-notice" role="alert">
            Commitment verification is blocked. Hollis cannot attest or export this completed case
            until its canonical policy and evidence binding is available. Refresh to retry.
          </aside>
        ) : null}
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
              <h2 id="evidence-lifecycle">Evidence references and retention</h2>
              <p>
                Evidence set:{" "}
                {reviewCase.status === "draft" || reviewCase.status === "pending"
                  ? "Editable before review starts"
                  : "Frozen for review"}
              </p>
              {keyEvidenceRecords(reviewCase.evidence).map(({ key, record: evidence }) => {
                const lifecycle = evidenceLifecycle.find(
                  (record) => record.id === evidence.id || record.digest === evidence.digest,
                );
                return (
                  <div key={key}>
                    <p>
                      {evidence.id} · {evidence.mediaType} · {evidence.digest}
                    </p>
                    {lifecycle ? (
                      <>
                        <p>
                          {lifecycle.verified
                            ? "Verified immutable reference"
                            : "No longer available"}{" "}
                          · retention {lifecycle.retentionStatus.replaceAll("_", " ")} · legal hold{" "}
                          {lifecycle.legalHold}
                        </p>
                        <p>
                          Retention until:{" "}
                          {lifecycle.retentionUntil
                            ? new Date(lifecycle.retentionUntil).toLocaleString()
                            : "not scheduled"}{" "}
                          · attempts: {lifecycle.attempts}
                          {lifecycle.deletedAt
                            ? ` · deleted ${new Date(lifecycle.deletedAt).toLocaleString()}`
                            : ""}
                          {lifecycle.lastFailure ? ` · last failure: ${lifecycle.lastFailure}` : ""}
                        </p>
                        {lifecycle.verified ? (
                          <form action={downloadEvidenceAction}>
                            <input name="caseId" type="hidden" value={caseId} />
                            <input name="evidenceId" type="hidden" value={lifecycle.id} />
                            <button type="submit">Open verified evidence</button>
                          </form>
                        ) : null}
                        {canManageRetention ? (
                          <form action={setEvidenceLegalHoldAction}>
                            <input name="caseId" type="hidden" value={caseId} />
                            <input name="evidenceId" type="hidden" value={lifecycle.id} />
                            <input
                              name="active"
                              type="hidden"
                              value={lifecycle.legalHold === "active" ? "false" : "true"}
                            />
                            <label>
                              <input name="confirmation" required type="checkbox" />I understand
                              this {lifecycle.legalHold === "active" ? "releases" : "places"} a
                              legal hold and changes retention eligibility.
                            </label>
                            <button type="submit">
                              {lifecycle.legalHold === "active"
                                ? "Release legal hold"
                                : "Place legal hold"}
                            </button>
                          </form>
                        ) : null}
                      </>
                    ) : (
                      <p>Lifecycle metadata is unavailable for this historical reference.</p>
                    )}
                    {canCreate &&
                    (reviewCase.status === "draft" || reviewCase.status === "pending") ? (
                      <form action={removeEvidenceAction}>
                        <input name="caseId" type="hidden" value={caseId} />
                        <input name="evidenceId" type="hidden" value={evidence.id} />
                        <button type="submit">Remove evidence</button>
                      </form>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {reviewCase.status === "completed" ? (
              <section className="evidence-panel" aria-labelledby="human-decision-title">
                <h2 id="human-decision-title">Recorded human decision</h2>
                <p>Outcome: {reviewCase.decisionOutcome ?? "not recorded"}</p>
                <p>Rationale: {reviewCase.decisionRationale ?? "not recorded"}</p>
                <p>Known limitations: {reviewCase.knownLimitations ?? "not recorded"}</p>
              </section>
            ) : null}
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
            <div>
              <dt>Case commitment</dt>
              <dd data-testid="attestation-case-commitment">
                {exported?.canonical
                  ? `${exported.canonical.commitmentVersion} ${exported.canonical.caseCommitment}`
                  : exported
                    ? `Legacy: hollis.review-export.v1 manifest ${exported.manifestHash}`
                    : "Verification blocked"}
              </dd>
            </div>
            <div>
              <dt>Contract authorization</dt>
              <dd>
                {managedAttestation.deployment
                  ? `${managedAttestation.deployment.sourceVersion ?? "legacy"} · ${managedAttestation.deployment.status} · runtime ${managedAttestation.deployment.runtimeAddress ?? "not recorded"}`
                  : "Awaiting server-authorized V8 deployment"}
              </dd>
            </div>
            {managedAttestation.deployment?.deploymentTransactionHash ? (
              <div>
                <dt>Deployment transaction</dt>
                <dd>{managedAttestation.deployment.deploymentTransactionHash}</dd>
              </div>
            ) : null}
            {managedAttestation.deployment?.failureCode ? (
              <div>
                <dt>Deployment condition</dt>
                <dd>{managedAttestation.deployment.failureCode.replaceAll("_", " ")}</dd>
              </div>
            ) : null}
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
        {canCreate && (reviewCase.status === "draft" || reviewCase.status === "pending") ? (
          <section className="detail-evidence-upload" id="add-evidence">
            <div>
              <p className="eyebrow">Controlled evidence</p>
              <h2>Add evidence</h2>
              <p>
                Files are integrity checked and stored outside the public attestation record.
                Maximum file size is 5 MB.
              </p>
            </div>
            <EvidenceUploader caseId={caseId} />
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
              <label htmlFor="knownLimitations">Known limitations</label>
              <textarea
                id="knownLimitations"
                name="knownLimitations"
                required
                aria-describedby="known-limitations-help"
              />
              <small id="known-limitations-help">
                Record the material limitations considered before this human decision.
              </small>
              <label>
                <input name="packetAcknowledged" required type="checkbox" />I reviewed the frozen
                evidence, policy control, recommendation, deadline, and any prior escalation.
              </label>
              <button type="submit">Record human decision</button>
            </form>
          </div>
        ) : null}
      </section>
    </div>
  );
}
