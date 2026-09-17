import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import "./landing.css";

const workflow = [
  [
    "01",
    "Set the control",
    "Publish the policy control and exact version that governs a class of consequential decisions.",
  ],
  [
    "02",
    "Build the record",
    "Attach private evidence, bind the case to its policy, and retain an append-only account of material actions.",
  ],
  [
    "03",
    "Apply judgment",
    "An authorized reviewer claims the case, records a rationale, and decides or escalates the outcome.",
  ],
  [
    "04",
    "Attest the process",
    "Eligible completed reviews receive a privacy-safe GenLayer process attestation and portable receipt.",
  ],
] as const;

export default function Home() {
  return (
    <main className="landing-page">
      <header className="landing-nav">
        <a className="landing-brand" href="#top" aria-label="Hollis home">
          <Image src="/assets/hollis-mark.svg" alt="" width={30} height={32} priority />
          <span>Hollis</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#workflow">How it works</a>
          <a href="#workspace">Workspace</a>
          <a href="#attestation">Attestation</a>
          <a href="#trust">Trust</a>
        </nav>
        <div className="landing-nav-actions">
          <a className="landing-signin" href="/sign-in">
            Sign in
          </a>
          <a className="landing-nav-cta" href="/sign-in">
            Request access <span aria-hidden="true">→</span>
          </a>
        </div>
      </header>

      <section id="top" className="landing-hero">
        <div className="landing-hero-copy landing-reveal">
          <p className="landing-kicker">AI governance for consequential decisions</p>
          <h1>Make AI decisions explainable before they are challenged.</h1>
          <p className="landing-lede">
            Hollis is the enterprise workspace for policy-bound review, private evidence,
            accountable human judgment, and independent GenLayer process attestation.
          </p>
          <div className="landing-hero-actions">
            <a className="landing-primary" href="/sign-in">
              Request access <span aria-hidden="true">→</span>
            </a>
            <a className="landing-watch" href="#workflow">
              <span aria-hidden="true">▶</span> See how it works
            </a>
          </div>
          <div className="landing-hero-notes">
            <span>Govern with evidence</span>
            <span>Operate with accountability</span>
            <span>Export what matters</span>
          </div>
        </div>
        <div className="landing-ledger" role="img" aria-label="The Hollis record flow">
          <div className="landing-orbit orbit-one" />
          <div className="landing-orbit orbit-two" />
          <div className="landing-signal signal-one" />
          <div className="landing-signal signal-two" />
          <article className="ledger-card ledger-policy">
            <small>01</small>
            <strong>Policy control</strong>
            <span>Defined governance rule</span>
            <i aria-hidden="true">⌁</i>
          </article>
          <article className="ledger-card ledger-evidence">
            <small>02</small>
            <strong>Evidence inventory</strong>
            <span>Private, integrity checked</span>
            <i aria-hidden="true">◌</i>
          </article>
          <article className="ledger-card ledger-review">
            <small>03</small>
            <strong>Human review</strong>
            <span>Rationale-backed outcome</span>
            <i aria-hidden="true">◫</i>
          </article>
          <article className="ledger-card ledger-receipt">
            <small>04</small>
            <strong>Independent receipt</strong>
            <span>Process attested through GenLayer</span>
            <i aria-hidden="true">✦</i>
          </article>
          <div className="landing-ledger-caption">
            From policy
            <br />
            to proof
          </div>
        </div>
      </section>

      <section id="workflow" className="landing-workflow">
        <div className="landing-section-heading landing-reveal">
          <p className="landing-kicker">A complete review path</p>
          <h2>One accountable record, from AI recommendation to receipt.</h2>
          <p>
            Hollis keeps the decision process legible without exposing sensitive evidence in the
            independent attestation layer.
          </p>
        </div>
        <ol>
          {workflow.map(([number, title, body], index) => (
            <li
              className="landing-workflow-step"
              key={number}
              style={{ "--step": index } as CSSProperties}
            >
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="workspace" className="landing-product-section">
        <div className="landing-product-copy landing-reveal">
          <p className="landing-kicker">The review workspace</p>
          <h2>Bring evidence, policy, and judgment into the same operating view.</h2>
          <p>
            A case is not a loose bundle of files. Hollis makes its policy binding, evidence
            references, decision context, reviewer activity, and event history visible together.
          </p>
          <ul>
            <li>Policy version and control are fixed at case creation</li>
            <li>Reviewers can claim, decide, or escalate with recorded rationale</li>
            <li>Material activity is retained as an append-only history</li>
          </ul>
          <a className="landing-text-link" href="/sign-in">
            Open Hollis <span aria-hidden="true">→</span>
          </a>
        </div>
        <Screen
          className="landing-screen-review landing-reveal-delay"
          src="/assets/landing/review-workspace.png"
          alt="Hollis review workspace showing policy, evidence, human review, and process verification"
        />
      </section>

      <section className="landing-overview-section">
        <Screen
          className="landing-screen-overview landing-reveal"
          src="/assets/landing/overview.png"
          alt="Hollis workspace overview with review priority map"
        />
        <div className="landing-overview-copy landing-reveal-delay">
          <p className="landing-kicker">Operational clarity</p>
          <h2>Know what requires attention, without losing the record behind it.</h2>
          <p>
            The workspace makes active, completed, and follow-up work easier to locate while
            preserving the detail needed to explain a decision later.
          </p>
          <div className="landing-stat-row">
            <strong>Policy-bound</strong>
            <span>Every new review case starts from a published control.</span>
          </div>
          <div className="landing-stat-row">
            <strong>Role-aware</strong>
            <span>
              Workspace permissions distinguish owners, administrators, reviewers, auditors, and
              contributors.
            </span>
          </div>
        </div>
      </section>

      <section id="attestation" className="landing-attestation">
        <div className="landing-attestation-copy landing-reveal">
          <p className="landing-kicker">Independent layer</p>
          <h2>Human judgment stays authoritative. The process becomes independently attestable.</h2>
          <p>
            For eligible completed reviews, Hollis produces a privacy-safe case file of bounded
            process facts. The managed GenLayer flow verifies that declared process after the human
            review is recorded.
          </p>
          <div className="landing-attestation-list">
            <span>
              <b>01</b>No raw evidence or private policy document on-chain
            </span>
            <span>
              <b>02</b>No customer Studio workflow, wallet, or transaction entry
            </span>
            <span>
              <b>03</b>A finalized receipt linked back to the completed review
            </span>
          </div>
        </div>
        <Screen
          className="landing-screen-attestation landing-reveal-delay"
          src="/assets/landing/attestation-record.png"
          alt="Hollis GenLayer attestation record with a finalized process-verification receipt"
        />
      </section>

      <section id="trust" className="landing-proof">
        <div className="landing-section-heading landing-reveal">
          <p className="landing-kicker">Designed for scrutiny</p>
          <h2>The information people need when a decision is questioned.</h2>
        </div>
        <div className="landing-proof-grid">
          <Proof number="01" title="Private evidence">
            Evidence stays outside the attestation record and is accessed through controlled,
            short-lived links.
          </Proof>
          <Proof number="02" title="Human authority">
            Hollis records accountable human judgment. Independent attestation does not replace the
            reviewer.
          </Proof>
          <Proof number="03" title="Portable records">
            Export a selected case as JSON, Markdown, DOCX, or PDF for audit and downstream
            reporting.
          </Proof>
          <Screen
            className="landing-screen-exports"
            src="/assets/landing/exports.png"
            alt="Hollis audit export options in JSON, Markdown, DOCX, and PDF"
          />
        </div>
      </section>

      <section className="landing-closing">
        <p className="landing-kicker">A better standard for consequential AI</p>
        <h2>Build a record that can stand behind the decision.</h2>
        <p>Start a workspace, publish a control, and bring the next review into view.</p>
        <a className="landing-primary" href="/sign-in">
          Create or access your workspace <span aria-hidden="true">→</span>
        </a>
      </section>
      <footer className="landing-footer">
        <a className="landing-brand" href="#top">
          <Image src="/assets/hollis-mark-reversed.svg" alt="" width={24} height={26} />
          <span>Hollis</span>
        </a>
        <p>Human oversight for consequential automated decisions.</p>
        <a href="/sign-in">Sign in</a>
      </footer>
    </main>
  );
}

function Screen({ className, src, alt }: { className: string; src: string; alt: string }) {
  return (
    <div className={`landing-screen-frame ${className}`}>
      <Image src={src} alt={alt} width={1920} height={1080} />
    </div>
  );
}

function Proof({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="landing-proof-card">
      <span>{number}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  );
}
