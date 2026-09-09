import Link from "next/link";
import { createReviewCaseAction } from "../actions";

export default function NewReviewCasePage() {
  return (
    <section className="new-review-case" aria-labelledby="new-review-case-title">
      <header className="new-review-case-heading">
        <Link href="/app">← Back to review queue</Link>
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
            External reference
            <input
              maxLength={128}
              name="externalReference"
              placeholder="e.g. underwriting-2026-0041"
              required
            />
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
          <label>
            Policy version
            <input
              maxLength={128}
              name="policyVersion"
              placeholder="e.g. credit-fairness-2026-01"
              required
            />
          </label>
          <label>
            Policy control
            <input
              maxLength={128}
              name="ruleId"
              placeholder="e.g. adverse-action-review"
              required
            />
          </label>
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
          <Link className="reference-secondary" href="/app">
            Cancel
          </Link>
          <button className="reference-primary" type="submit">
            Create review case <span>›</span>
          </button>
        </div>
      </form>
    </section>
  );
}
