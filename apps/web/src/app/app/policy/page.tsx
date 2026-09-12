import Link from "next/link";
import { readHollisSession } from "@/lib/hollis-session";
import { OperationalPageHeader } from "../operational-page-header";
import { createWorkspacePolicyAction } from "../review-cases/actions";
import { listWorkspacePolicies } from "../review-cases/data";

export default async function PolicyLibraryPage() {
  const [policies, session] = await Promise.all([listWorkspacePolicies(), readHollisSession()]);
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
              <article className="policy-library-card" key={policy.id}>
                <p className="eyebrow">Published · {policy.version}</p>
                <h3>{policy.title}</h3>
                <p>{policy.policyId}</p>
                <dl>
                  <div>
                    <dt>Document digest</dt>
                    <dd>{policy.documentDigest}</dd>
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
              </article>
            ))
          ) : (
            <p className="policy-library-empty">No policy has been published in this workspace.</p>
          )}
        </section>
        {canManagePolicies ? (
          <form action={createWorkspacePolicyAction} className="policy-library-form">
            <p className="eyebrow">Owner and administrator action</p>
            <h2>Publish a policy version</h2>
            <p>
              Publishing creates an immutable policy version and its first control. Add a new policy
              version when the rule changes.
            </p>
            <label>
              Policy title
              <input name="title" maxLength={160} required />
            </label>
            <label>
              Policy ID
              <input name="policyId" pattern="[a-z][a-z0-9-]{0,127}" required />
            </label>
            <label>
              Version
              <input name="version" maxLength={128} required />
            </label>
            <label>
              Policy document SHA-256 digest
              <input
                name="documentDigest"
                pattern="sha256:[a-f0-9]{64}"
                placeholder="sha256:..."
                required
              />
            </label>
            <fieldset>
              <legend>First control</legend>
              <label>
                Control title
                <input name="controlTitle" maxLength={160} required />
              </label>
              <label>
                Control ID
                <input name="controlId" maxLength={128} required />
              </label>
              <label>
                Control version
                <input name="controlVersion" maxLength={128} required />
              </label>
              <label>
                Attestation criterion
                <textarea name="attestationCriterion" maxLength={1000} required />
              </label>
              <label>
                Evidence requirement
                <select name="evidenceRequirement" defaultValue="verified_reference_required">
                  <option value="verified_reference_required">
                    Verified evidence reference required
                  </option>
                  <option value="reference_required">Evidence reference required</option>
                  <option value="none">No evidence reference required</option>
                </select>
              </label>
              <label>
                Interpretation
                <select name="interpretation" defaultValue="deterministic">
                  <option value="deterministic">Deterministic process check</option>
                  <option value="judgment_required">Judgment required</option>
                </select>
              </label>
            </fieldset>
            <button className="reference-primary" type="submit">
              Publish policy version <span>›</span>
            </button>
          </form>
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
