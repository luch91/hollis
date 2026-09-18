"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createWorkspacePolicyAction, type PolicyPublicationState } from "../review-cases/actions";

const initialPolicyPublicationState: PolicyPublicationState = { status: "idle" };

function publicationMessage(state: PolicyPublicationState) {
  switch (state.status) {
    case "source":
      return "Hollis could not verify that policy source document. Upload a non-empty PDF, DOCX, Markdown, or plain-text file no larger than 5 MB.";
    case "permission":
      return "Policy publication requires an owner or administrator role in the active workspace. Sign in again if your workspace role has just changed.";
    case "unavailable":
      return "Policy document storage is temporarily unavailable. No policy version was published. Retry shortly.";
    case "conflict":
      return "This policy ID and version already exist. Open the Policy Library to review the immutable record, or publish a revised version.";
    case "error":
      return "Hollis could not confirm the publication result. Before retrying, refresh the Policy Library and check this policy ID and version.";
    default:
      return null;
  }
}

export function PolicyPublisher() {
  const [state, formAction] = useActionState(
    createWorkspacePolicyAction,
    initialPolicyPublicationState,
  );
  const message = publicationMessage(state);

  return (
    <form action={formAction} className="policy-library-form" encType="multipart/form-data">
      <p className="eyebrow">Owner and administrator action</p>
      <h2>Publish a policy version</h2>
      <p>
        Publishing creates an immutable policy version and its first control. Add a new policy
        version when the rule changes.
      </p>
      {state.status === "published" ? (
        <div className="policy-publication-result policy-publication-success" role="status">
          <p className="eyebrow">Policy published</p>
          <strong>
            {state.title} · {state.version}
          </strong>
          <p>
            The immutable policy record is available now. You can open it directly without retrying
            this form.
          </p>
          <Link href={`/app/policy/${state.policyVersionId}`}>
            Open published policy <span>›</span>
          </Link>
        </div>
      ) : null}
      {message ? (
        <div className="policy-publication-result policy-publication-error" role="alert">
          {message}
        </div>
      ) : null}
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
        Policy source document
        <input
          accept=".pdf,.docx,.md,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
          name="policySourceFile"
          type="file"
          required
        />
        <span>
          PDF, DOCX, Markdown, or plain text, up to 5 MB. Hollis calculates and locks the SHA-256
          digest when you publish.
        </span>
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
      <PublishButton />
    </form>
  );
}

function PublishButton() {
  const { pending } = useFormStatus();
  return (
    <button className="reference-primary" disabled={pending} type="submit">
      {pending ? "Publishing policy version…" : "Publish policy version"} <span>›</span>
    </button>
  );
}
