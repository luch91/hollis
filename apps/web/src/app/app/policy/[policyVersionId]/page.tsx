import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationalPageHeader } from "../../operational-page-header";
import { getPolicyContractDeployment, listWorkspacePolicies } from "../../review-cases/data";

export default async function PolicyDetailPage({
  params,
}: {
  params: Promise<{ policyVersionId: string }>;
}) {
  const [{ policyVersionId }, policies] = await Promise.all([params, listWorkspacePolicies()]);
  const policy = policies.find((candidate) => candidate.id === policyVersionId);
  if (!policy) notFound();

  return (
    <section className="policy-detail" aria-labelledby="policy-detail-title">
      <OperationalPageHeader
        eyebrow="Published policy record"
        summary="This approved policy version is immutable. Its complete control definition is available for review and audit."
        title={policy.title}
        titleId="policy-detail-title"
      />
      <Link className="back-link policy-library-back-link" href="/app/policy">
        ← Back to Policy Library
      </Link>
      <div className="policy-detail-grid">
        <section className="policy-detail-record" aria-labelledby="policy-metadata-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Read-only</p>
              <h2 id="policy-metadata-title">Policy metadata</h2>
            </div>
            <span className="policy-detail-status">Published</span>
          </div>
          <dl className="policy-detail-list">
            <div>
              <dt>Policy ID</dt>
              <dd>{policy.policyId}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>{policy.version}</dd>
            </div>
            <div>
              <dt>Published</dt>
              <dd>
                {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
                  new Date(policy.publishedAt),
                )}
              </dd>
            </div>
            <div>
              <dt>Document digest</dt>
              <dd className="policy-detail-digest">{policy.documentDigest}</dd>
            </div>
            <div>
              <dt>Source document</dt>
              <dd>{policy.source?.fileName ?? "Not attached to this historical record"}</dd>
            </div>
            {policy.source ? (
              <div>
                <dt>Source format</dt>
                <dd>
                  {policy.source.mediaType} · {Math.ceil(policy.source.sizeBytes / 1024)} KB
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
        <aside className="policy-detail-guidance">
          <p className="eyebrow">Integrity boundary</p>
          <h2>Versioned by design</h2>
          <p>
            Changes to this policy require a new version. Hollis retains this record so every case
            can be reviewed against the policy that governed it at the time.
          </p>
        </aside>
      </div>
      <section className="policy-detail-controls" aria-labelledby="policy-controls-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Declared controls</p>
            <h2 id="policy-controls-title">Controls</h2>
          </div>
          <span className="queue-count">{policy.controls.length}</span>
        </div>
        {policy.controls.map(async (control) => {
          const deployment = await getPolicyContractDeployment(policy.id, control.controlId).catch(
            () => null,
          );
          return (
            <article className="policy-detail-control" key={control.controlId}>
              <header>
                <div>
                  <p className="eyebrow">
                    {control.controlId} · {control.controlVersion}
                  </p>
                  <h3>{control.title}</h3>
                </div>
                <span>Read-only</span>
              </header>
              <dl>
                <div>
                  <dt>Attestation criterion</dt>
                  <dd>{control.attestationCriterion}</dd>
                </div>
                <div>
                  <dt>Evidence requirement</dt>
                  <dd>{control.evidenceRequirement.replaceAll("_", " ")}</dd>
                </div>
                <div>
                  <dt>Interpretation</dt>
                  <dd>{control.interpretation.replaceAll("_", " ")}</dd>
                </div>
              </dl>
              <p className="policy-detail-deployment">
                GenLayer: {deployment?.status ?? "not deployed"}
              </p>
              <p className="policy-detail-deployment-note">
                Hollis manages deployment and activation for this immutable control.
              </p>
            </article>
          );
        })}
      </section>
    </section>
  );
}
