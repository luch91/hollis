import Link from "next/link";
import { redirect } from "next/navigation";
import { readHollisSession } from "@/lib/hollis-session";
import { canCreateReviewCases } from "../../workspace-capabilities";
import { createReviewCaseAction } from "../actions";
import { listWorkspacePolicies } from "../data";

export default async function NewReviewCasePage() {
  const session = await readHollisSession();
  if (!canCreateReviewCases(session?.session.activeWorkspace?.role ?? "")) {
    redirect("/app/review-cases?access=case-create-restricted");
  }
  const policies = await listWorkspacePolicies();
  return (
    <section className="new-review-case" aria-labelledby="new-review-case-title">
      <header className="new-review-case-heading">
        <Link href="/app/review-cases">← Back to review queue</Link>
        <p className="eyebrow">New review case</p>
        <h1 id="new-review-case-title">Record a decision for human review.</h1>
        <p>
          Hollis stores the policy binding, risk assessment, and evidence reference before a
          reviewer can make a final decision.
        </p>
      </header>
      <form action={createReviewCaseAction} className="new-review-case-form">
        <fieldset>
          <legend>Decision context</legend>
          <label>
            Source reference
            <input
              maxLength={128}
              name="externalReference"
              placeholder="e.g. underwriting-2026-0041"
              required
            />
            <small>
              Hollis creates an immutable case reference after this record is submitted.
            </small>
          </label>
          <label>
            Automated system version
            <input
              maxLength={128}
              name="automatedSystemVersion"
              placeholder="e.g. eligibility-model-2.4"
              required
            />
          </label>
          <label>
            Recommendation
            <select defaultValue="" name="recommendation" required>
              <option disabled value="">
                Select a recommendation
              </option>
              <option value="approve">Approve</option>
              <option value="partial_approve">Partial approve</option>
              <option value="deny">Deny</option>
              <option value="investigate">Investigate</option>
              <option value="refer">Refer</option>
            </select>
          </label>
          <label>
            Risk level
            <select defaultValue="" name="riskLevel" required>
              <option disabled value="">
                Select a risk level
              </option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
        </fieldset>
        <fieldset>
          <legend>Policy and review deadline</legend>
          {policies.length > 0 ? (
            <label className="new-review-case-span">
              Published policy control
              <select defaultValue="" name="policyBinding" required>
                <option disabled value="">
                  Select an approved policy control
                </option>
                {policies.flatMap((policy) =>
                  policy.controls.map((control) => (
                    <option
                      key={`${policy.id}-${control.controlId}`}
                      value={`${policy.version}::${control.controlId}`}
                    >
                      {policy.title} · {policy.version} · {control.title}
                    </option>
                  )),
                )}
              </select>
            </label>
          ) : (
            <div className="new-review-case-policy-empty new-review-case-span">
              <strong>No published policy is available.</strong>
              <p>
                A workspace owner or administrator must publish a policy control before a case can
                open.
              </p>
              <Link href="/app/policy">Open Policy Library</Link>
            </div>
          )}
          <label>
            Review due at, UTC
            <input name="reviewDueAt" required type="datetime-local" />
          </label>
        </fieldset>
        <fieldset>
          <legend>Initial evidence</legend>
          <p>
            Upload one file to establish the first evidence reference. Its integrity digest is
            calculated by Hollis and the stored object is verified before the case opens.
          </p>
          <label>
            Evidence file
            <input
              accept="application/pdf,image/*,text/plain,text/csv,application/json"
              name="evidenceFile"
              required
              type="file"
            />
          </label>
          <small>
            Maximum file size: 5 MB. Do not upload secrets or data outside your authority to use.
          </small>
        </fieldset>
        <div className="new-review-case-actions">
          <Link className="reference-secondary" href="/app/review-cases">
            Cancel
          </Link>
          <button className="reference-primary" disabled={policies.length === 0} type="submit">
            Create review case <span>›</span>
          </button>
        </div>
      </form>
    </section>
  );
}
