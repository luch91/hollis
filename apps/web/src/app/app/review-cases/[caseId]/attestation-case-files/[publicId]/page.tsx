import Link from "next/link";
import { notFound } from "next/navigation";
import { getReviewCase, listAttestations, listPublicAttestationCaseFiles } from "../../../data";

function formattedDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export default async function AttestationCaseFilePage({
  params,
}: {
  params: Promise<{ caseId: string; publicId: string }>;
}) {
  const { caseId, publicId } = await params;
  const [reviewCase, publicCaseFiles, attestations] = await Promise.all([
    getReviewCase(caseId).catch(() => notFound()),
    listPublicAttestationCaseFiles(caseId).catch(() => notFound()),
    listAttestations(caseId).catch(() => []),
  ]);
  const publicCaseFile = publicCaseFiles.find((record) => record.publicId === publicId);
  if (!publicCaseFile) notFound();

  const matchingAttestation = attestations.find(
    (record) => record.caseCommitment === publicCaseFile.caseFile.caseCommitment,
  );
  const { caseFile } = publicCaseFile;

  return (
    <section className="content attestation-record-page" aria-labelledby="attestation-record-title">
      <div className="detail-toolbar">
        <Link className="back-link" href={`/app/review-cases/${caseId}#attestation`}>
          Back to process attestation
        </Link>
        <a href={publicCaseFile.publicCaseFileUrl} rel="noreferrer" target="_blank">
          Open canonical JSON
        </a>
      </div>
      <header className="attestation-record-hero">
        <p className="eyebrow">Hollis attestation record</p>
        <h1 id="attestation-record-title">{reviewCase.hollisCaseReference}</h1>
        <p>
          A human-readable view of the immutable, public-safe process record supplied to GenLayer.
        </p>
      </header>
      <section className="attestation-record-summary" aria-label="Attestation record summary">
        <div>
          <span>Case status</span>
          <strong>{reviewCase.status.replaceAll("_", " ")}</strong>
        </div>
        <div>
          <span>Human outcome</span>
          <strong>{caseFile.review.humanDecisionOutcome ?? "Not recorded"}</strong>
        </div>
        <div>
          <span>GenLayer verdict</span>
          <strong>{matchingAttestation?.verdict?.replaceAll("_", " ") ?? "Not submitted"}</strong>
        </div>
      </section>
      <section className="attestation-record-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Policy binding</p>
            <h2>Declared control</h2>
          </div>
        </div>
        <dl>
          <div>
            <dt>Policy</dt>
            <dd>{caseFile.policy.policyId}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{caseFile.policy.policyVersion}</dd>
          </div>
          <div>
            <dt>Control</dt>
            <dd>
              {caseFile.policy.control.controlId} · {caseFile.policy.control.controlVersion}
            </dd>
          </div>
          <div>
            <dt>Criterion</dt>
            <dd>{caseFile.policy.control.attestationCriterion}</dd>
          </div>
          <div>
            <dt>Policy digest</dt>
            <dd>{caseFile.policy.control.policyDocumentDigest}</dd>
          </div>
        </dl>
      </section>
      <section className="attestation-record-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Process evidence</p>
            <h2>Bound process facts</h2>
          </div>
        </div>
        <dl>
          <div>
            <dt>Evidence references</dt>
            <dd>
              {caseFile.evidence.length} integrity-checked reference
              {caseFile.evidence.length === 1 ? "" : "s"}
            </dd>
          </div>
          <div>
            <dt>Human decision</dt>
            <dd>{caseFile.review.decisionRecorded ? "Recorded" : "Not recorded"}</dd>
          </div>
          <div>
            <dt>Escalation</dt>
            <dd>{caseFile.review.escalationRecorded ? "Recorded" : "Not recorded"}</dd>
          </div>
          <div>
            <dt>Case commitment</dt>
            <dd>{caseFile.caseCommitment}</dd>
          </div>
          <div>
            <dt>Commitment version</dt>
            <dd>{caseFile.commitmentVersion ?? "Legacy: hollis.adjudication-case.v1 manifest"}</dd>
          </div>
          <div>
            <dt>Audit manifest</dt>
            <dd>{caseFile.auditManifestHash}</dd>
          </div>
        </dl>
      </section>
      <section className="attestation-record-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Record provenance</p>
            <h2>Publication details</h2>
          </div>
        </div>
        <dl>
          <div>
            <dt>Published</dt>
            <dd>{formattedDate(publicCaseFile.createdAt)} UTC</dd>
          </div>
          <div>
            <dt>Schema</dt>
            <dd>{caseFile.schemaVersion}</dd>
          </div>
          <div>
            <dt>Canonical source</dt>
            <dd>
              <a href={publicCaseFile.publicCaseFileUrl} rel="noreferrer" target="_blank">
                Open structured case file
              </a>
            </dd>
          </div>
          {matchingAttestation?.transactionHash ? (
            <div>
              <dt>Studio Dev transaction</dt>
              <dd>{matchingAttestation.transactionHash}</dd>
            </div>
          ) : null}
        </dl>
      </section>
    </section>
  );
}
