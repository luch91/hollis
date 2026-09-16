import type { ReviewExport } from "@hollis/contracts/review-case";
import Link from "next/link";
import { readHollisSession } from "@/lib/hollis-session";
import { getReviewExport, listReviewCases, type ReviewQueueItem } from "./review-cases/data";
import {
  caseUrgency,
  dueBucket,
  orderHorizonCases,
  type HorizonBucket,
  type HorizonRow,
  riskRow,
} from "./review-cases/review-presentation";
import { canCreateReviewCases } from "./workspace-capabilities";
import { seedDemoWorkspaceAction } from "./review-cases/actions";

function formatDate(value: string | null) {
  if (!value) return "No deadline";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value));
}

function Horizon({
  activeCaseCount,
  cases,
  now,
}: {
  activeCaseCount: number;
  cases: ReviewQueueItem[];
  now: Date;
}) {
  const rows: Array<{ key: HorizonRow; label: string; detail: string }> = [
    { key: "critical", label: "Critical", detail: "Immediate oversight" },
    { key: "high", label: "High", detail: "Priority review" },
    { key: "standard", label: "Standard", detail: "Medium and low risk" },
  ];
  const columns: Array<{ key: HorizonBucket; label: string }> = [
    { key: "overdue", label: "Overdue" },
    { key: "today", label: "Next 24 hours" },
    { key: "soon", label: "Next 7 days" },
    { key: "later", label: "Later" },
  ];

  return (
    <section className="overview-horizon" aria-labelledby="review-horizon-title">
      <header>
        <div>
          <p className="eyebrow">Priority map</p>
          <h2 id="review-horizon-title">Your review horizon</h2>
          <p>Risk and deadline in one operational view.</p>
        </div>
        <Link className="overview-horizon-action" href="/app/review-cases">
          Open review workspace <span>›</span>
        </Link>
      </header>
      <div className="overview-horizon-grid">
        <span className="horizon-grid-corner" />
        {columns.map((column) => (
          <strong key={column.key}>{column.label}</strong>
        ))}
        {rows.map((row) => (
          <div className="horizon-grid-row" key={row.key}>
            <div className="horizon-row-label">
              <strong>{row.label}</strong>
              <small>{row.detail}</small>
            </div>
            {columns.map((column) => {
              const matching = orderHorizonCases(
                cases.filter(
                  (reviewCase) =>
                    riskRow(reviewCase.riskLevel) === row.key &&
                    dueBucket(reviewCase.reviewDueAt, now) === column.key,
                ),
              );
              return (
                <div className="horizon-grid-cell" key={column.key}>
                  {matching.map((reviewCase) => (
                    <Link
                      className={`horizon-case horizon-case-${column.key}${reviewCase.status === "completed" ? " horizon-case-completed" : ""}`}
                      href={`/app/review-cases?caseId=${reviewCase.id}`}
                      key={reviewCase.id}
                    >
                      <strong>{reviewCase.hollisCaseReference}</strong>
                      <span>{reviewCase.externalReference}</span>
                      {reviewCase.status === "completed" ? <small>Completed</small> : null}
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <footer>
        <span>
          {cases.length} tracked {cases.length === 1 ? "case" : "cases"}, {activeCaseCount} active
        </span>
        <strong>Evidence before outcome.</strong>
      </footer>
    </section>
  );
}

function NextAction({
  canCreate,
  reviewCase,
}: {
  canCreate: boolean;
  reviewCase: ReviewQueueItem | null;
}) {
  if (!reviewCase) {
    return (
      <aside className="overview-next-action overview-next-action-empty">
        <p className="eyebrow">Queue clear</p>
        <h2>No active decision requires review.</h2>
        <p>New cases will appear here after they are bound to a published policy control.</p>
        {canCreate ? (
          <Link href="/app/review-cases/new">
            New review case <span>›</span>
          </Link>
        ) : (
          <small>Read-only workspace access</small>
        )}
      </aside>
    );
  }
  return (
    <aside className="overview-next-action">
      <div className="overview-next-heading">
        <p className="eyebrow">Next decision</p>
        <span className={`risk risk-${reviewCase.riskLevel}`}>{reviewCase.riskLevel}</span>
      </div>
      <h2>{reviewCase.externalReference}</h2>
      <p>
        {reviewCase.recommendation.replaceAll("_", " ")} recommendation requiring an accountable
        human outcome.
      </p>
      <dl>
        <div>
          <dt>Case</dt>
          <dd>{reviewCase.hollisCaseReference}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{reviewCase.status.replaceAll("_", " ")}</dd>
        </div>
        <div>
          <dt>Due</dt>
          <dd>{formatDate(reviewCase.reviewDueAt)}</dd>
        </div>
      </dl>
      <Link href={`/app/review-cases?caseId=${reviewCase.id}`}>
        Open case <span>›</span>
      </Link>
    </aside>
  );
}

function Activity({ exports: caseExports }: { exports: ReviewExport[] }) {
  const events = caseExports
    .flatMap((exported) =>
      exported.events.map((event) => ({
        ...event,
        caseId: exported.case.id,
        caseReference: exported.case.hollisCaseReference,
      })),
    )
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 5);
  return (
    <section className="overview-activity petrol-panel">
      <header>
        <h2>Latest movement</h2>
        <Link href="/app/audit">
          View audit activity <span>›</span>
        </Link>
      </header>
      {events.length ? (
        events.map((event) => (
          <Link
            href={`/app/review-cases?caseId=${event.caseId}&tab=history`}
            key={`${event.caseId}:${event.eventSequence}`}
          >
            <span className="activity-marker" aria-hidden="true" />
            <div>
              <strong>{event.eventType.replaceAll("_", " ")}</strong>
              <small>{event.caseReference}</small>
            </div>
            <time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time>
          </Link>
        ))
      ) : (
        <p className="petrol-empty">No review activity has been recorded.</p>
      )}
    </section>
  );
}

function FollowUp({ cases }: { cases: ReviewQueueItem[] }) {
  const followUp = cases
    .filter((reviewCase) => reviewCase.status === "escalated" || reviewCase.status === "pending")
    .slice(0, 4);
  return (
    <section className="overview-follow-up petrol-panel">
      <header>
        <h2>Cases requiring follow-up</h2>
        <Link href="/app/review-cases?status=escalated">
          View escalations <span>›</span>
        </Link>
      </header>
      {followUp.length ? (
        followUp.map((reviewCase) => (
          <Link href={`/app/review-cases?caseId=${reviewCase.id}`} key={reviewCase.id}>
            <div>
              <strong>{reviewCase.hollisCaseReference}</strong>
              <small>{reviewCase.externalReference}</small>
            </div>
            <span className={`queue-state queue-state-${reviewCase.status}`}>
              {reviewCase.status.replaceAll("_", " ")}
            </span>
          </Link>
        ))
      ) : (
        <p className="petrol-empty">No pending or escalated case requires follow-up.</p>
      )}
    </section>
  );
}

export default async function ApplicationPage() {
  const [session, activeCases, completedCases] = await Promise.all([
    readHollisSession(),
    listReviewCases(),
    listReviewCases("completed"),
  ]);
  const canCreate = canCreateReviewCases(session?.session.activeWorkspace?.role ?? "");
  const canManage = ["owner", "administrator"].includes(
    session?.session.activeWorkspace?.role ?? "",
  );
  const now = new Date();
  const nextCase =
    [...activeCases]
      .sort((left, right) => caseUrgency(left, now) - caseUrgency(right, now))
      .at(0) ?? null;
  const activityCases = [...activeCases, ...completedCases].slice(0, 8);
  const caseExports = (
    await Promise.all(
      activityCases.map((reviewCase) => getReviewExport(reviewCase.id).catch(() => null)),
    )
  ).filter((exported): exported is ReviewExport => exported !== null);
  return (
    <section className="petrol-overview">
      <header className="petrol-page-intro petrol-overview-heading">
        <h1>Your workspace in perspective</h1>
      </header>
      <div className="overview-primary-grid">
        <Horizon
          activeCaseCount={activeCases.length}
          cases={[...activeCases, ...completedCases]}
          now={now}
        />
        <NextAction canCreate={canCreate} reviewCase={nextCase} />
      </div>
      {canManage && activeCases.length === 0 && completedCases.length === 0 ? (
        <form action={seedDemoWorkspaceAction} className="overview-demo-seed">
          <p className="eyebrow">Demo workspace</p>
          <h2>Explore Hollis with synthetic cases.</h2>
          <p>
            Load three clearly labelled DEMO cases for a guided review workflow. They expire after
            14 days.
          </p>
          <button className="primary-action" type="submit">
            Load DEMO cases
          </button>
        </form>
      ) : null}
      <div className="overview-secondary-grid">
        <Activity exports={caseExports} />
        <FollowUp cases={activeCases} />
      </div>
    </section>
  );
}
