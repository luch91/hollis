import Link from "next/link";
import { readHollisSession } from "@/lib/hollis-session";
import { OperationalPageHeader } from "../operational-page-header";
import { listWorkspacePolicies } from "../review-cases/data";
import { PolicyPublisher } from "./policy-publisher";

export default async function PolicyLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ publish?: string }>;
}) {
  const [policies, session, params] = await Promise.all([
    listWorkspacePolicies(),
    readHollisSession(),
    searchParams,
  ]);
  const canManagePolicies =
    session?.session.activeWorkspace?.role === "owner" ||
    session?.session.activeWorkspace?.role === "administrator";
  return (
    <section className="policy-library" aria-labelledby="policy-library-title">
      <OperationalPageHeader
        eyebrow="Workspace governance"
        summary="Published policies are immutable workspace records. New cases can only use a listed control."
        title="Policy Library"
        titleId="policy-library-title"
      />
      <Link className="back-link policy-library-back-link" href="/app/review-cases">
        ← Back to review queue
      </Link>
      {params.publish === "conflict" ? (
        <p className="policy-library-notice" role="status">
          This policy ID and version already exist with different immutable content. Review the
          published record below, or publish the revised policy under a new version.
        </p>
      ) : null}
      {params.publish?.startsWith("policy_source_") ||
      params.publish === "source-file-invalid" ||
      params.publish === "source-file-type-required" ? (
        <p className="policy-library-notice" role="status">
          Hollis could not verify that policy source document. Upload a non-empty PDF, DOCX,
          Markdown, or plain-text file no larger than 5 MB.
        </p>
      ) : null}
      <div className="policy-library-grid">
        <section className="policy-library-list" aria-labelledby="published-policies-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Approved source of truth</p>
              <h2 id="published-policies-title">Published policies</h2>
            </div>
            <span className="queue-count">{policies.length}</span>
          </div>
          {policies.length ? (
            policies.map((policy) => (
              <Link
                aria-label={`Open ${policy.title}, version ${policy.version}`}
                className="policy-library-card-link"
                href={`/app/policy/${policy.id}`}
                key={policy.id}
              >
                <article className="policy-library-card">
                  <p className="eyebrow">Published · {policy.version}</p>
                  <h3>{policy.title}</h3>
                  <p>{policy.policyId}</p>
                  <dl>
                    <div>
                      <dt>Document digest</dt>
                      <dd>{policy.documentDigest}</dd>
                    </div>
                    <div>
                      <dt>Source document</dt>
                      <dd>{policy.source?.fileName ?? "Historical record"}</dd>
                    </div>
                    <div>
                      <dt>Controls</dt>
                      <dd>{policy.controls.length}</dd>
                    </div>
                  </dl>
                  <ul>
                    {policy.controls.map((control) => (
                      <li key={control.controlId}>
                        <strong>{control.title}</strong>
                        <span>
                          {control.controlId} · {control.controlVersion}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <span className="policy-library-card-action" aria-hidden="true">
                    View immutable record <span>›</span>
                  </span>
                </article>
              </Link>
            ))
          ) : (
            <p className="policy-library-empty">No policy has been published in this workspace.</p>
          )}
        </section>
        {canManagePolicies ? (
          <PolicyPublisher />
        ) : (
          <aside className="policy-library-form">
            <p className="eyebrow">Read-only access</p>
            <h2>Policy publication is restricted</h2>
            <p>Only a workspace owner or administrator can publish an immutable policy version.</p>
          </aside>
        )}
      </div>
    </section>
  );
}
