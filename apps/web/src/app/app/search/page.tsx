import Link from "next/link";
import {
  getReviewCase,
  listReviewCases,
  searchWorkspaceReviewers,
  type ReviewCaseDetail,
  type ReviewQueueItem,
} from "../review-cases/data";

function includesQuery(values: Array<string | null>, query: string) {
  return values.some((value) => value?.toLocaleLowerCase().includes(query));
}

function caseHref(reviewCase: ReviewQueueItem) {
  const status = reviewCase.status === "completed" ? "completed" : "active";
  return `/app/review-cases?status=${status}&caseId=${reviewCase.id}`;
}

function CaseResults({ cases }: { cases: ReviewQueueItem[] }) {
  return (
    <section className="global-search-results" aria-labelledby="case-search-results">
      <header>
        <h2 className="global-search-result-heading" id="case-search-results">
          Cases
        </h2>
        <span>{cases.length}</span>
      </header>
      {cases.length ? (
        <div className="workspace-list">
          {cases.map((reviewCase) => (
            <Link href={caseHref(reviewCase)} key={reviewCase.id}>
              <span>
                <strong>{reviewCase.hollisCaseReference}</strong>
                <small>{reviewCase.externalReference}</small>
              </span>
              <span>
                <span className={`risk risk-${reviewCase.riskLevel}`}>{reviewCase.riskLevel}</span>
                <small>{reviewCase.status.replaceAll("_", " ")}</small>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="workspace-empty">No case matches this search.</p>
      )}
    </section>
  );
}

function IssueResults({ cases }: { cases: ReviewCaseDetail[] }) {
  return (
    <section className="global-search-results" aria-labelledby="issue-search-results">
      <header>
        <h2 className="global-search-result-heading" id="issue-search-results">
          Issues and controls
        </h2>
        <span>{cases.length}</span>
      </header>
      {cases.length ? (
        <div className="workspace-list">
          {cases.map((reviewCase) => (
            <Link href={caseHref(reviewCase)} key={reviewCase.id}>
              <span>
                <strong>{reviewCase.ruleId}</strong>
                <small>{reviewCase.policyVersion}</small>
              </span>
              <span>
                <small>{reviewCase.hollisCaseReference}</small>
                <small>{reviewCase.recommendation.replaceAll("_", " ")}</small>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="workspace-empty">No recorded issue or policy control matches this search.</p>
      )}
    </section>
  );
}

export default async function WorkspaceSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const query = (await searchParams).q?.trim() ?? "";
  const normalized = query.toLocaleLowerCase();
  const searchable = query.length >= 2;
  const [openCases, completedCases] = searchable
    ? await Promise.all([listReviewCases(), listReviewCases("completed")])
    : [[], []];
  const cases = [...openCases, ...completedCases];
  const details = searchable
    ? await Promise.all(cases.map((reviewCase) => getReviewCase(reviewCase.id)))
    : [];
  const reviewers = searchable ? await searchWorkspaceReviewers(query) : [];
  const caseResults = cases.filter((reviewCase) =>
    includesQuery(
      [
        reviewCase.hollisCaseReference,
        reviewCase.externalReference,
        reviewCase.recommendation,
        reviewCase.riskLevel,
        reviewCase.status,
      ],
      normalized,
    ),
  );
  const issueResults = details.filter((reviewCase) =>
    includesQuery(
      [
        reviewCase.ruleId,
        reviewCase.policyVersion,
        reviewCase.automatedSystemVersion,
        reviewCase.recommendation,
        reviewCase.escalationReason,
        reviewCase.decisionOutcome,
      ],
      normalized,
    ),
  );

  return (
    <section className="workspace-section-page global-search-page">
      <header className="workspace-section-header">
        <p className="eyebrow">Workspace search</p>
        <h1>Find a case, issue, or reviewer</h1>
        <p>Results are restricted to the active workspace.</p>
      </header>
      {!searchable ? (
        <p className="workspace-empty">Use the search control in the workspace header.</p>
      ) : (
        <div className="global-search-result-groups">
          <CaseResults cases={caseResults} />
          <IssueResults cases={issueResults} />
          <section className="global-search-results" aria-labelledby="reviewer-search-results">
            <header>
              <h2 className="global-search-result-heading" id="reviewer-search-results">
                Reviewers
              </h2>
              <span>{reviewers.length}</span>
            </header>
            {reviewers.length ? (
              <div className="workspace-list reviewer-search-list">
                {reviewers.map((reviewer) => (
                  <article key={reviewer.userId}>
                    <span className="account-avatar" aria-hidden="true">
                      {(reviewer.displayName || reviewer.email || "R").slice(0, 1).toUpperCase()}
                    </span>
                    <span>
                      <strong>
                        {reviewer.displayName || reviewer.email || "Workspace reviewer"}
                      </strong>
                      {reviewer.displayName && reviewer.email ? (
                        <small>{reviewer.email}</small>
                      ) : null}
                    </span>
                    <span className="account-role">{reviewer.role}</span>
                  </article>
                ))}
              </div>
            ) : (
              <p className="workspace-empty">No reviewer matches this search.</p>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
