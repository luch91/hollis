import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export type DocumentationSection = {
  id: string;
  title: string;
  content: ReactNode;
};

export type DocumentationPage = {
  description: string;
  eyebrow: string;
  sections: DocumentationSection[];
  title: string;
};

function Note({ children, title }: { children: ReactNode; title: string }) {
  return (
    <aside className="docs-note">
      <strong className="docs-note-title">{title}</strong>
      <div>{children}</div>
    </aside>
  );
}

function InterfaceReference({
  caption,
  children,
  label,
}: {
  caption: string;
  children: ReactNode;
  label: string;
}) {
  return (
    <figure className="docs-interface-reference">
      <div className="docs-interface-toolbar">
        <span className="docs-interface-brand">Hollis</span>
        <span>{label}</span>
      </div>
      <div className="docs-interface-canvas">{children}</div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

function DocumentationScreenshot({
  alt,
  caption,
  height,
  src,
  width,
}: {
  alt: string;
  caption: string;
  height: number;
  src: string;
  width: number;
}) {
  return (
    <figure
      className={width < height ? "docs-screenshot docs-screenshot-portrait" : "docs-screenshot"}
    >
      <Image
        alt={alt}
        height={height}
        sizes="(max-width: 820px) 100vw, 820px"
        src={src}
        width={width}
      />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="docs-field">
      <span>{label}</span>
      <strong className="docs-field-value">{children}</strong>
    </div>
  );
}

function WorkflowProgress({ active }: { active: number }) {
  const steps = [
    "Account",
    "Workspace",
    "Policy",
    "Case",
    "Evidence",
    "Review",
    "Attestation",
    "Export",
  ];
  return (
    <ol className="docs-workflow-progress" aria-label="Hollis workflow">
      {steps.map((step, index) => (
        <li
          className={index + 1 === active ? "active" : index + 1 < active ? "complete" : ""}
          key={step}
        >
          <span>{String(index + 1).padStart(2, "0")}</span>
          {step}
        </li>
      ))}
    </ol>
  );
}

const howHollisWorks: DocumentationPage = {
  eyebrow: "Product guide",
  title: "How Hollis works",
  description: "From account creation to a defensible review record.",
  sections: [
    {
      id: "create-account",
      title: "1. Create and verify your account",
      content: (
        <>
          <WorkflowProgress active={1} />
          <p>
            Open the Hollis sign-in page and choose Google, GitHub, or email and password. Hollis
            uses Google Cloud Identity Platform to authenticate the identity, then exchanges the
            verified identity token for an opaque Hollis browser session.
          </p>
          <ol>
            <li>
              Select <strong>Create an account</strong> for email registration, or choose a
              supported provider.
            </li>
            <li>
              For email registration, use the verification message before returning to sign in.
            </li>
            <li>Sign in with the same method used to create the identity.</li>
            <li>Hollis sends you to workspace setup when no active workspace membership exists.</li>
          </ol>
          <Note title="Identity is not workspace access">
            <p>
              A verified account identifies a user. It does not grant access to any organization or
              case.
            </p>
          </Note>
          <DocumentationScreenshot
            alt="Hollis account access screen with Google, GitHub, and email sign-in options"
            caption="The account-access page offers Google, GitHub, and verified email-and-password sign-in. Select Create an account to switch the email form into registration mode."
            height={900}
            src="/assets/documentation/account-access.png"
            width={1440}
          />
        </>
      ),
    },
    {
      id: "create-workspace",
      title: "2. Create or join a workspace",
      content: (
        <>
          <WorkflowProgress active={2} />
          <p>
            A workspace is the organization boundary for policies, cases, evidence references,
            reviewers, audit events, and attestations. A new user can create a workspace and become
            its first owner, or accept a recipient-bound invitation from an existing workspace.
          </p>
          <ol>
            <li>Enter the organization name on the workspace setup screen.</li>
            <li>
              Select <strong>Create workspace</strong>.
            </li>
            <li>
              Open <strong>Admin</strong> to set the industry, operating region, and website.
            </li>
            <li>Invite authorized colleagues with the minimum role they require.</li>
          </ol>
          <Note title="Workspace isolation">
            <p>
              Hollis resolves tenant scope from the authenticated membership. A form field or URL
              cannot choose another tenant.
            </p>
          </Note>
          <InterfaceReference
            caption="Workspace setup creates an isolated organization and assigns the creator as owner."
            label="Workspace setup"
          >
            <div className="docs-shot-form narrow">
              <p className="eyebrow">Workspace setup</p>
              <h3>Create your organization workspace.</h3>
              <Field label="Organization name">Northstar Assurance</Field>
              <span className="docs-shot-primary">Create workspace</span>
            </div>
          </InterfaceReference>
        </>
      ),
    },
    {
      id: "publish-policy",
      title: "3. Publish a policy control",
      content: (
        <>
          <WorkflowProgress active={3} />
          <p>
            Every new case must bind to a published policy control. The policy library is the
            workspace source of truth for the rule that governed the review. Publishing records a
            version and its document digest. Published versions are not silently rewritten.
          </p>
          <ol>
            <li>
              Open <strong>Policies</strong>. Only an owner or administrator can publish.
            </li>
            <li>Enter the policy title, stable policy ID, version, and SHA-256 document digest.</li>
            <li>
              Define the first control, its criterion, evidence requirement, and interpretation
              mode.
            </li>
            <li>
              Select <strong>Publish policy version</strong>.
            </li>
          </ol>
          <Note title="What the digest proves">
            <p>
              The digest identifies the policy document used. It does not prove that the policy is
              lawful, complete, or suitable.
            </p>
          </Note>
          <InterfaceReference
            caption="A published policy version supplies the controls that can be selected when a case is created."
            label="Policy Library"
          >
            <div className="docs-shot-grid">
              <div>
                <p className="eyebrow">Published policies</p>
                <h3>Human review policy</h3>
                <Field label="Version">2026.1</Field>
                <Field label="Control">human-review-required</Field>
              </div>
              <div>
                <p className="eyebrow">Owner action</p>
                <Field label="Document digest">sha256: 64 hexadecimal characters</Field>
                <Field label="Evidence requirement">Verified reference required</Field>
                <span className="docs-shot-primary">Publish policy version</span>
              </div>
            </div>
          </InterfaceReference>
        </>
      ),
    },
    {
      id: "create-case",
      title: "4. Create a review case",
      content: (
        <>
          <WorkflowProgress active={4} />
          <p>
            A case records an automated recommendation that requires accountable human review.
            Hollis captures the source reference, automated system version, recommendation, risk
            level, policy binding, review deadline, and first evidence file before opening the
            workflow.
          </p>
          <ol>
            <li>
              Open <strong>Review</strong> and select <strong>New review case</strong>.
            </li>
            <li>Enter a unique source reference from the decision-producing system.</li>
            <li>Record the exact automated-system version, recommendation, and assessed risk.</li>
            <li>Select one published policy control and set the review deadline in UTC.</li>
            <li>Choose the initial evidence file and submit the form.</li>
          </ol>
          <p>
            Hollis creates an immutable public-facing reference in the format{" "}
            <code>HL-YY-XXXX-XXXX</code>. The UUID remains an internal record key.
          </p>
          <InterfaceReference
            caption="Case creation binds the decision, policy control, deadline, and initial managed evidence reference."
            label="New review case"
          >
            <div className="docs-shot-form">
              <div className="docs-shot-grid">
                <Field label="Source reference">underwriting-2026-0041</Field>
                <Field label="Automated system version">eligibility-model-2.4</Field>
                <Field label="Recommendation">Refer</Field>
                <Field label="Risk level">High</Field>
                <Field label="Published policy control">Human review policy · 2026.1</Field>
                <Field label="Review due at, UTC">14 September 2026, 16:00</Field>
              </div>
              <Field label="Initial evidence">decision-record-0041.json</Field>
              <span className="docs-shot-primary">Create review case</span>
            </div>
          </InterfaceReference>
        </>
      ),
    },
    {
      id: "add-evidence",
      title: "5. Add and verify evidence",
      content: (
        <>
          <WorkflowProgress active={5} />
          <p>
            Evidence supports the human review. Hollis computes an integrity digest, stores the file
            through the configured evidence provider, and records tenant-scoped metadata. Public
            attestation files contain evidence references and process facts, not raw evidence
            content.
          </p>
          <ol>
            <li>
              Open the case and move to <strong>Controlled evidence</strong>.
            </li>
            <li>Select a file that the organization is authorized to use.</li>
            <li>
              Select <strong>Upload and verify evidence</strong>.
            </li>
            <li>
              Confirm the reference, media type, and SHA-256 digest in the case evidence list.
            </li>
          </ol>
          <Note title="Current evidence boundary">
            <p>
              The Evidence page is an inventory of references already attached to cases. It is not
              yet a reusable evidence library.
            </p>
          </Note>
          <InterfaceReference
            caption="The review record displays evidence metadata and integrity references without exposing raw content in the public attestation."
            label="Controlled evidence"
          >
            <div className="docs-shot-evidence">
              <div>
                <span>01</span>
                <strong>decision-record-0041.json</strong>
                <small>application/json</small>
              </div>
              <code>sha256:70623b5a956cbf028577665069e71f626fa7518835e015bd5adaab6c5ab24f78</code>
              <span className="docs-shot-primary">Upload and verify evidence</span>
            </div>
          </InterfaceReference>
        </>
      ),
    },
    {
      id: "record-decision",
      title: "6. Record the human decision",
      content: (
        <>
          <WorkflowProgress active={6} />
          <p>
            A reviewer claims a pending or escalated case before acting. The reviewer can escalate
            with a reason or complete the review with an outcome, final recommendation, and
            rationale. Hollis records the action in the append-only case history.
          </p>
          <ol>
            <li>
              Select <strong>Claim for review</strong> on a pending case.
            </li>
            <li>Inspect the decision context, policy binding, evidence, and event history.</li>
            <li>Escalate when another authorized reviewer or additional evidence is required.</li>
            <li>
              Otherwise select approved, modified, or rejected and record the final recommendation.
            </li>
            <li>
              Write a decision rationale that explains the evidence and policy basis, then submit.
            </li>
          </ol>
          <Note title="Human authorization remains mandatory">
            <p>
              An automated recommendation alone cannot authorize an adverse or consequential action.
              Hollis records the review but does not execute the upstream action.
            </p>
          </Note>
          <InterfaceReference
            caption="The human review requires an explicit outcome, final recommendation, and rationale."
            label="Human review"
          >
            <div className="docs-shot-review">
              <div className="docs-shot-grid">
                <Field label="Outcome">Modified</Field>
                <Field label="Final recommendation">Investigate</Field>
              </div>
              <Field label="Rationale">
                Independent review required an additional control before release.
              </Field>
              <div className="docs-shot-actions">
                <span>Escalate case</span>
                <span className="docs-shot-primary">Record human decision</span>
              </div>
            </div>
          </InterfaceReference>
        </>
      ),
    },
    {
      id: "request-attestation",
      title: "7. Request independent attestation",
      content: (
        <>
          <WorkflowProgress active={7} />
          <p>
            After human review is complete, Hollis can generate a privacy-safe adjudication case
            file. The file binds the declared policy control, managed evidence references, human
            decision, and case commitment for automatic GenLayer Studio Next evaluation.
          </p>
          <ol>
            <li>
              Open the completed case and locate <strong>Process attestation</strong>.
            </li>
            <li>Confirm that human decision, policy binding, and managed evidence are ready.</li>
            <li>
              Hollis generates the controlled public case file when the publisher is configured.
            </li>
            <li>
              Hollis submits the exact commitment and file URL to the active policy-control
              contract.
            </li>
            <li>Wait for the recorded status to progress from pending to finalized.</li>
            <li>Confirm the verdict, commitment, and transaction receipt in Hollis.</li>
          </ol>
          <Note title="Attestation scope">
            <p>
              GenLayer checks the declared process facts. It does not establish the truth of private
              evidence, substantive fairness, or legal compliance.
            </p>
          </Note>
          <InterfaceReference
            caption="Attestation is a separate post-review layer and never replaces the authorized human decision."
            label="Independent attestation"
          >
            <ol className="docs-shot-horizon">
              <li className="complete">
                <span>01</span>
                <strong>Evidence references</strong>
                <small>Available</small>
              </li>
              <li className="complete">
                <span>02</span>
                <strong>System decision</strong>
                <small>Recorded</small>
              </li>
              <li className="complete">
                <span>03</span>
                <strong>Policy alignment</strong>
                <small>Bound</small>
              </li>
              <li className="complete">
                <span>04</span>
                <strong>Human review</strong>
                <small>Recorded</small>
              </li>
              <li>
                <span>05</span>
                <strong>Final receipt</strong>
                <small>Pending</small>
              </li>
            </ol>
          </InterfaceReference>
        </>
      ),
    },
    {
      id: "export-record",
      title: "8. Export the review record",
      content: (
        <>
          <WorkflowProgress active={8} />
          <p>
            Hollis exports a portable case record for review, reporting, and audit preparation. The
            export contains the case data, evidence references, ordered append-only events,
            attestation records when available, and a manifest hash.
          </p>
          <ol>
            <li>
              Open <strong>Exports</strong>.
            </li>
            <li>Locate the Hollis Case Reference.</li>
            <li>Choose JSON, Markdown, DOCX, or PDF.</li>
            <li>
              Store the file according to the organization&apos;s approved handling and retention
              rules.
            </li>
          </ol>
          <p>
            PDF and DOCX provide reader-oriented reports. JSON and Markdown preserve portable
            structured or plain-text records.
          </p>
          <InterfaceReference
            caption="Each format is generated from the same authenticated, tenant-scoped case export."
            label="Portable case records"
          >
            <div className="docs-shot-export">
              <div>
                <strong>HL-26-7M4K-P9Q2</strong>
                <small>Completed review record</small>
              </div>
              <nav aria-label="Example export formats">
                <span>JSON</span>
                <span>MD</span>
                <span>DOCX</span>
                <span>PDF</span>
              </nav>
            </div>
          </InterfaceReference>
        </>
      ),
    },
  ],
};

const pages: Record<string, DocumentationPage> = {
  "how-hollis-works": howHollisWorks,
  "getting-started": {
    eyebrow: "Start here",
    title: "Getting started",
    description: "Set up a verified account and an isolated organization workspace.",
    sections: [
      {
        id: "before-you-start",
        title: "Before you start",
        content: (
          <>
            <p>
              Use an identity and organization name that you are authorized to represent.
              Email-and-password accounts must verify their address before Hollis establishes a
              session.
            </p>
            <ul>
              <li>A modern browser with cookies enabled</li>
              <li>A Google or GitHub identity, or a verified work email</li>
              <li>Authority to create the organization workspace or a valid invitation</li>
            </ul>
          </>
        ),
      },
      {
        id: "account",
        title: "Create the account",
        content: (
          <>
            <p>
              Choose Google, GitHub, or email and password on the sign-in page. If an account
              already exists for the email under another provider, sign in with the original
              provider. Hollis does not treat a matching email as permission to merge identities or
              grant workspace access.
            </p>
            <Link className="docs-inline-link" href="/sign-in">
              Open sign in
            </Link>
            <DocumentationScreenshot
              alt="Hollis account access form shown at its compact responsive width"
              caption="The compact account-access layout preserves the same providers and verified email flow on a narrow screen."
              height={900}
              src="/assets/documentation/account-access-mobile.png"
              width={500}
            />
          </>
        ),
      },
      {
        id: "workspace",
        title: "Enter a workspace",
        content: (
          <>
            <p>
              Create a new workspace to become its owner, or open a recipient-bound invitation while
              signed in with the invited verified email. After entry, complete the organization
              profile in Admin and publish at least one policy control before creating a case.
            </p>
          </>
        ),
      },
    ],
  },
  "review-cases": {
    eyebrow: "Core workflow",
    title: "Review cases",
    description: "Create, claim, escalate, and complete accountable reviews.",
    sections: [
      {
        id: "appropriate-cases",
        title: "What belongs in a case",
        content: (
          <>
            <p>
              Use Hollis when an automated recommendation could materially affect a person,
              organization, entitlement, access decision, investigation, or other consequential
              outcome and a declared policy requires human oversight.
            </p>
            <p>
              Do not upload a final business action as though Hollis executed it. Hollis records the
              review process around the recommendation.
            </p>
          </>
        ),
      },
      {
        id: "required-input",
        title: "Required case information",
        content: (
          <>
            <ul>
              <li>Unique source reference</li>
              <li>Exact automated-system version</li>
              <li>Recommendation and risk level</li>
              <li>Published policy control</li>
              <li>UTC review deadline</li>
              <li>Initial evidence file</li>
            </ul>
            <p>
              Reusing a source reference with different content is rejected because the reference is
              the workspace intake idempotency key.
            </p>
          </>
        ),
      },
      {
        id: "state-model",
        title: "Case states",
        content: (
          <>
            <dl className="docs-definition-list">
              <div>
                <dt>Pending</dt>
                <dd>Created and waiting for a reviewer to claim it.</dd>
              </div>
              <div>
                <dt>In review</dt>
                <dd>Claimed by a reviewer and open for escalation or decision.</dd>
              </div>
              <div>
                <dt>Escalated</dt>
                <dd>
                  Returned for another authorized reviewer to claim with the reason preserved.
                </dd>
              </div>
              <div>
                <dt>Completed</dt>
                <dd>A human outcome, final recommendation, and rationale are recorded.</dd>
              </div>
            </dl>
          </>
        ),
      },
      {
        id: "decision-quality",
        title: "Record a defensible decision",
        content: (
          <>
            <p>
              Inspect the full case record before deciding. The rationale should identify the
              decisive evidence and explain how the selected policy control applies. If required
              evidence is missing or authority is unclear, escalate instead of completing the case.
            </p>
          </>
        ),
      },
    ],
  },
  "policies-and-controls": {
    eyebrow: "Governance source",
    title: "Policies and controls",
    description: "Represent the exact rule that governs each review.",
    sections: [
      {
        id: "policy-version",
        title: "Policy version",
        content: (
          <>
            <p>
              A published policy records a title, stable policy ID, version, SHA-256 document
              digest, publication time, and publisher. Create a new version when the governing
              document changes.
            </p>
          </>
        ),
      },
      {
        id: "control",
        title: "Control representation",
        content: (
          <>
            <p>
              A control has its own ID, version, title, attestation criterion, evidence requirement,
              and interpretation mode. Deterministic controls check explicit process facts.
              Judgment-required controls declare that substantive interpretation is expected.
            </p>
          </>
        ),
      },
      {
        id: "publication",
        title: "Publish carefully",
        content: (
          <>
            <p>
              Only workspace owners and administrators can publish. Confirm the digest against the
              approved policy file before submission. A published record is intended to remain
              immutable so historical cases keep their original binding.
            </p>
          </>
        ),
      },
      {
        id: "case-binding",
        title: "Bind a case",
        content: (
          <>
            <p>
              The case form lists controls from published workspace policies. Hollis records the
              selected policy version and control on the case. It does not infer a policy from the
              workspace industry or rewrite an existing case when a later version appears.
            </p>
          </>
        ),
      },
    ],
  },
  evidence: {
    eyebrow: "Controlled record",
    title: "Evidence",
    description:
      "Attach integrity-checked evidence without exposing raw files in public attestations.",
    sections: [
      {
        id: "what-to-upload",
        title: "What to upload",
        content: (
          <>
            <p>
              Upload material needed to assess the recommendation against the bound policy, such as
              a decision record, model output, relevant log extract, approved policy artifact, or
              source-system report. Upload only information the organization is authorized to
              process.
            </p>
          </>
        ),
      },
      {
        id: "upload",
        title: "Upload and verification",
        content: (
          <>
            <p>
              The initial file is required when a case is created. Additional files can be attached
              from the case detail page. Hollis calculates a digest, stores the object through the
              configured provider, verifies it, and appends an evidence event.
            </p>
            <p>
              The current maximum file size is 5 MB. The case form accepts PDF, images, plain text,
              CSV, and JSON.
            </p>
          </>
        ),
      },
      {
        id: "inventory",
        title: "Evidence inventory",
        content: (
          <>
            <p>
              The Evidence page lists references already attached to workspace cases. It is not a
              reusable evidence library and does not support independent upload or cross-case reuse.
            </p>
          </>
        ),
      },
      {
        id: "public-boundary",
        title: "Public attestation boundary",
        content: (
          <>
            <p>
              Raw evidence and personal data stay outside the public case file. GenLayer receives
              only the validated public-safe schema, including necessary process facts and integrity
              commitments.
            </p>
          </>
        ),
      },
    ],
  },
  "genlayer-attestations": {
    eyebrow: "Independent process check",
    title: "GenLayer attestations",
    description: "Verify the declared review process after the human decision is recorded.",
    sections: [
      {
        id: "role",
        title: "GenLayer's role",
        content: (
          <>
            <p>
              GenLayer is the independent adjudication layer for the declared policy check. Hollis
              prepares a privacy-safe case file, and the approved Intelligent Contract evaluates
              whether the recorded process satisfies the stated criterion.
            </p>
            <p>
              The attestation sits after human review. It does not make or execute the
              organization&apos;s underlying decision.
            </p>
          </>
        ),
      },
      {
        id: "readiness",
        title: "Readiness requirements",
        content: (
          <>
            <ul>
              <li>The case is completed with a human decision.</li>
              <li>The case is bound to the declared policy control.</li>
              <li>The evidence requirement is satisfied by managed references.</li>
              <li>The public publisher and contract address are configured.</li>
            </ul>
          </>
        ),
      },
      {
        id: "case-file",
        title: "Controlled case file",
        content: (
          <>
            <p>
              Hollis generates an immutable <code>hollis.adjudication-case.v1</code> file under a
              random public identifier. It excludes raw evidence, personal information, private
              prompts, and policy document content.
            </p>
          </>
        ),
      },
      {
        id: "import",
        title: "Automatic receipt recording",
        content: (
          <>
            <p>
              After the Studio Next transaction finalizes, Hollis verifies the contract, commitment,
              finalized status, and retained result before recording the receipt.
            </p>
          </>
        ),
      },
      {
        id: "limits",
        title: "Interpret the result correctly",
        content: (
          <>
            <p>
              A pass, fail, needs review, or undetermined verdict describes the contract&apos;s
              declared process evaluation. It is not proof that private evidence was true and is not
              a guarantee of legal or regulatory compliance.
            </p>
          </>
        ),
      },
    ],
  },
  "audit-and-exports": {
    eyebrow: "Portable record",
    title: "Audit and exports",
    description: "Follow the append-only chronology and export a complete case record.",
    sections: [
      {
        id: "events",
        title: "Append-only events",
        content: (
          <>
            <p>
              Case creation, review claims, evidence additions, escalation, decisions, retention
              actions, and attestation records are appended as events. Corrections create new events
              rather than changing earlier entries.
            </p>
          </>
        ),
      },
      {
        id: "hash-chain",
        title: "Hash-chain integrity",
        content: (
          <>
            <p>
              Events use a database-generated sequence and link to the previous event hash. The
              chain helps expose alteration or reordering. It does not establish that every source
              statement was accurate.
            </p>
          </>
        ),
      },
      {
        id: "formats",
        title: "Export formats",
        content: (
          <>
            <dl className="docs-definition-list">
              <div>
                <dt>JSON</dt>
                <dd>Structured case package for systems and technical verification.</dd>
              </div>
              <div>
                <dt>Markdown</dt>
                <dd>Portable plain-text review record.</dd>
              </div>
              <div>
                <dt>DOCX</dt>
                <dd>Reader-oriented report for controlled document workflows.</dd>
              </div>
              <div>
                <dt>PDF</dt>
                <dd>Fixed-layout report for review and audit preparation.</dd>
              </div>
            </dl>
          </>
        ),
      },
      {
        id: "manifest",
        title: "Manifest hash",
        content: (
          <>
            <p>
              Each export includes a manifest hash for the exported record. A later event changes
              the record, so a new export can have a different manifest hash.
            </p>
          </>
        ),
      },
    ],
  },
  "workspace-administration": {
    eyebrow: "Organization controls",
    title: "Workspace administration",
    description: "Manage profile information, roles, invitations, and the control history.",
    sections: [
      {
        id: "profile",
        title: "Organization profile",
        content: (
          <>
            <p>
              Owners and administrators can update the workspace name, controlled industry value,
              operating region, and website. Organization logo placement is reserved, but upload
              remains disabled until the managed-media security design is implemented.
            </p>
          </>
        ),
      },
      {
        id: "roles",
        title: "Roles",
        content: (
          <>
            <dl className="docs-definition-list">
              <div>
                <dt>Owner</dt>
                <dd>
                  Controls the workspace and can manage administrators. The initial creator is the
                  first owner.
                </dd>
              </div>
              <div>
                <dt>Administrator</dt>
                <dd>
                  Manages approved workspace controls within the boundaries granted by the owner.
                </dd>
              </div>
              <div>
                <dt>Reviewer</dt>
                <dd>Claims, escalates, and records review decisions when authorized.</dd>
              </div>
              <div>
                <dt>Contributor</dt>
                <dd>Supports case operations without administrative control.</dd>
              </div>
              <div>
                <dt>Auditor</dt>
                <dd>Reviews records through read-oriented permissions.</dd>
              </div>
            </dl>
          </>
        ),
      },
      {
        id: "invitations",
        title: "Invitations",
        content: (
          <>
            <p>
              Invitations are tenant-scoped, recipient-bound, expire after seven days, and can be
              used once. The accepting account must have the invited verified email. Revoke an
              unused invitation from Invitation activity when access is no longer intended.
            </p>
          </>
        ),
      },
      {
        id: "history",
        title: "Control history",
        content: (
          <>
            <p>
              Profile changes, invitation actions, and membership changes are recorded in a separate
              append-only workspace hash chain.
            </p>
          </>
        ),
      },
    ],
  },
  troubleshooting: {
    eyebrow: "Reference",
    title: "Troubleshooting",
    description: "Resolve common account, workspace, evidence, review, and attestation conditions.",
    sections: [
      {
        id: "account",
        title: "Account and verification",
        content: (
          <>
            <dl className="docs-definition-list">
              <div>
                <dt>Verify your email</dt>
                <dd>Complete the Identity Platform verification message, then sign in again.</dd>
              </div>
              <div>
                <dt>Account exists with another credential</dt>
                <dd>
                  Use the original provider for that email. Do not create a duplicate identity to
                  bypass the message.
                </dd>
              </div>
              <div>
                <dt>Password reset</dt>
                <dd>Enter the email on the sign-in form before selecting Forgot password.</dd>
              </div>
            </dl>
          </>
        ),
      },
      {
        id: "workspace",
        title: "Workspace access",
        content: (
          <>
            <dl className="docs-definition-list">
              <div>
                <dt>No workspace</dt>
                <dd>
                  Create one during onboarding or accept a valid invitation for the verified email.
                </dd>
              </div>
              <div>
                <dt>Invitation unavailable</dt>
                <dd>
                  Ask an owner or administrator to confirm the recipient, expiry, use, and
                  revocation state.
                </dd>
              </div>
              <div>
                <dt>Workspace cannot load</dt>
                <dd>
                  Do not repeat a decision action. Preserve the error reference and confirm API
                  availability before retrying.
                </dd>
              </div>
            </dl>
          </>
        ),
      },
      {
        id: "cases",
        title: "Cases and evidence",
        content: (
          <>
            <dl className="docs-definition-list">
              <div>
                <dt>No published policy</dt>
                <dd>
                  An owner or administrator must publish a policy control before case creation.
                </dd>
              </div>
              <div>
                <dt>Evidence upload fails</dt>
                <dd>
                  Confirm file size and media type, then verify that the configured storage provider
                  is available. Do not treat a failed upload as recorded evidence.
                </dd>
              </div>
              <div>
                <dt>Decision action fails</dt>
                <dd>
                  Confirm the case is in review and assigned to the current reviewer before
                  retrying.
                </dd>
              </div>
            </dl>
          </>
        ),
      },
      {
        id: "attestation",
        title: "Attestation",
        content: (
          <>
            <dl className="docs-definition-list">
              <div>
                <dt>Publisher not configured</dt>
                <dd>
                  The environment needs a verified HTTPS public API origin before case-file
                  publication is available.
                </dd>
              </div>
              <div>
                <dt>Commitment mismatch</dt>
                <dd>Use the exact commitment and URL from the same generated Hollis case file.</dd>
              </div>
              <div>
                <dt>Undetermined</dt>
                <dd>
                  Inspect the recorded reason and transaction before making any claim about the
                  process outcome.
                </dd>
              </div>
            </dl>
          </>
        ),
      },
    ],
  },
  privacy: {
    eyebrow: "Trust documentation",
    title: "Privacy and data handling",
    description: "A factual overview of the data Hollis currently processes and its boundaries.",
    sections: [
      {
        id: "scope",
        title: "Scope",
        content: (
          <>
            <p>
              This page describes the current Hollis product design. It is not a customer
              data-processing agreement and does not replace any notice or agreement required
              between an organization and the people whose information it processes.
            </p>
          </>
        ),
      },
      {
        id: "account-data",
        title: "Account and workspace data",
        content: (
          <>
            <p>
              Hollis receives a verified identity subject, email address, verification state, and
              optional display name or avatar claim from Google Cloud Identity Platform. Hollis
              stores the user record, opaque session information, workspace memberships,
              organization profile, roles, and invitation activity needed to provide access.
            </p>
          </>
        ),
      },
      {
        id: "review-data",
        title: "Review data",
        content: (
          <>
            <p>
              A workspace can record source references, automated-system versions, recommendations,
              risk levels, policy bindings, review deadlines, reviewer actions, rationales, evidence
              metadata, integrity digests, audit events, and attestation records. Organizations must
              not upload data they lack authority to use.
            </p>
          </>
        ),
      },
      {
        id: "evidence",
        title: "Evidence and public attestations",
        content: (
          <>
            <p>
              Raw evidence is stored through the configured private object-storage provider.
              PostgreSQL stores tenant-scoped evidence metadata. A public attestation case file is
              created only through the controlled workflow and excludes raw evidence and personal
              data by design.
            </p>
          </>
        ),
      },
      {
        id: "retention",
        title: "Retention and deletion",
        content: (
          <>
            <p>
              The repository defines a provisional evidence-retention model with holds and audited
              deletion jobs. Final retention schedules remain subject to the organization,
              jurisdiction, customer contract, and approved deployment configuration. Hollis must
              not be represented as providing a universal retention period.
            </p>
          </>
        ),
      },
      {
        id: "controls",
        title: "Access and integrity controls",
        content: (
          <>
            <p>
              Workspace membership and roles gate access. Tenant context is applied before protected
              operations, PostgreSQL row-level security protects tenant-scoped records, sessions are
              opaque and revocable, and security-sensitive actions are recorded.
            </p>
          </>
        ),
      },
      {
        id: "questions",
        title: "Privacy questions",
        content: (
          <>
            <p>
              Workspace-specific questions should be directed to the organization that created the
              workspace. A public Hollis privacy contact and legal-operator notice must be approved
              before commercial production activation.
            </p>
          </>
        ),
      },
    ],
  },
  security: {
    eyebrow: "Trust documentation",
    title: "Security overview",
    description: "The current security boundaries, controls, and explicit limitations.",
    sections: [
      {
        id: "identity",
        title: "Identity and sessions",
        content: (
          <>
            <p>
              Google Cloud Identity Platform verifies Google, GitHub, and email-and-password
              identities. Hollis validates issuer, audience, expiry, subject, and verified email
              before issuing an opaque application session in an HttpOnly cookie.
            </p>
          </>
        ),
      },
      {
        id: "tenancy",
        title: "Tenant isolation",
        content: (
          <>
            <p>
              Protected requests resolve the active workspace from server-side membership, apply
              permission checks, and establish transaction-local tenant context. PostgreSQL
              row-level security is enabled for tenant-scoped records.
            </p>
          </>
        ),
      },
      {
        id: "evidence",
        title: "Evidence protection",
        content: (
          <>
            <p>
              Evidence uses a provider-neutral private storage boundary, object-specific signed
              access, integrity digests, metadata verification, retention controls, and legal holds.
              Sensitive evidence is excluded from public attestations.
            </p>
          </>
        ),
      },
      {
        id: "audit",
        title: "Audit integrity",
        content: (
          <>
            <p>
              Review and workspace-control histories are append-only hash chains. Corrections are
              new events. Browser state, authenticated input, automated explanations, hashes, and
              consensus are explicitly excluded as independent proof of truth.
            </p>
          </>
        ),
      },
      {
        id: "limitations",
        title: "Current limitations",
        content: (
          <>
            <p>
              The current release still requires provider acceptance tests, recovery exercises, a
              shared limiter for multi-instance deployment, approved production hosting, and
              independent security testing before commercial production activation.
            </p>
          </>
        ),
      },
      {
        id: "reporting",
        title: "Report a security concern",
        content: (
          <>
            <p>
              Do not place credentials, personal data, or exploit details in a public issue. A
              private security-reporting address must be approved and monitored before public
              launch.
            </p>
          </>
        ),
      },
    ],
  },
  terms: {
    eyebrow: "Trust documentation",
    title: "Evaluation terms",
    description: "The operating limits that apply to the current Hollis evaluation release.",
    sections: [
      {
        id: "status",
        title: "Evaluation status",
        content: (
          <>
            <p>
              Hollis is currently an evaluation release. Commercial service terms, service levels,
              legal-operator details, and customer data-processing terms have not been approved.
              This page must not be presented as a final commercial agreement.
            </p>
          </>
        ),
      },
      {
        id: "authorized-use",
        title: "Authorized use",
        content: (
          <>
            <p>
              Use Hollis only for an organization you are authorized to represent and only with data
              that organization is authorized to process. Do not attempt to access another
              workspace, bypass role controls, interfere with the service, or place secrets in
              review evidence.
            </p>
          </>
        ),
      },
      {
        id: "decisions",
        title: "Decision responsibility",
        content: (
          <>
            <p>
              Hollis records a governance workflow. It does not execute external decisions, provide
              legal advice, or guarantee compliance. The organization remains responsible for its
              policy, reviewers, evidence, final actions, notices, and appeal obligations.
            </p>
          </>
        ),
      },
      {
        id: "attestations",
        title: "Attestation limits",
        content: (
          <>
            <p>
              A GenLayer result concerns the declared process submitted to the contract. It does not
              establish that private evidence is true, that an outcome is fair, or that a decision
              complies with every applicable law.
            </p>
          </>
        ),
      },
      {
        id: "final-terms",
        title: "Commercial activation",
        content: (
          <>
            <p>
              Final terms require the legal operator, governing law, contact details, service
              commitments, suspension and termination rules, liability terms, and data-processing
              responsibilities to be approved by qualified counsel.
            </p>
          </>
        ),
      },
    ],
  },
  support: {
    eyebrow: "Reference",
    title: "Support",
    description: "Collect the right information without exposing protected data.",
    sections: [
      {
        id: "before-reporting",
        title: "Before reporting a problem",
        content: (
          <>
            <ol>
              <li>Record the page and action that failed.</li>
              <li>Copy the Hollis Case Reference, not raw evidence or a session token.</li>
              <li>Record the displayed error reference and time.</li>
              <li>Confirm whether the issue affects one case or the whole workspace.</li>
              <li>
                Do not repeat a consequential decision action until its recorded state is checked.
              </li>
            </ol>
          </>
        ),
      },
      {
        id: "include",
        title: "Safe diagnostic information",
        content: (
          <>
            <ul>
              <li>Hollis Case Reference</li>
              <li>Workspace name</li>
              <li>Browser and operating-system version</li>
              <li>UTC timestamp</li>
              <li>Error reference or sanitized console message</li>
              <li>Expected and observed behavior</li>
            </ul>
          </>
        ),
      },
      {
        id: "exclude",
        title: "Never send",
        content: (
          <>
            <ul>
              <li>Passwords, session cookies, API keys, or OAuth secrets</li>
              <li>Raw evidence or personal claim data</li>
              <li>Unredacted policy documents</li>
              <li>Private GenLayer inputs beyond the public case file</li>
            </ul>
          </>
        ),
      },
      {
        id: "channel",
        title: "Support channel",
        content: (
          <>
            <p>
              A monitored public support address has not yet been approved. Until it is available,
              workspace members should use their organization&apos;s authorized administrator
              channel. Security reports must not be filed publicly.
            </p>
          </>
        ),
      },
    ],
  },
};

export function getDocumentationPage(slug: string): DocumentationPage | null {
  return pages[slug] ?? null;
}
