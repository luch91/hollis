import Link from "next/link";
import { listReviewCases } from "./data";

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value))
    : "No deadline";
}

export default async function ReviewCasesPage() {
  const cases = await listReviewCases();

  return (
    <section className="content queue" aria-labelledby="queue-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Review queue</p>
          <h1 id="queue-title">Cases needing a decision</h1>
        </div>
        <span className="queue-count">{cases.length} open</span>
      </div>
      {cases.length === 0 ? (
        <p className="empty-state">No open review cases.</p>
      ) : (
        <div className="case-list">
          {cases.map((item) => (
            <Link className="case-row" href={`/app/review-cases/${item.id}`} key={item.id}>
              <span>
                <strong>{item.externalReference}</strong>
                <small>
                  {item.status.replace("_", " ")} · due {formatDate(item.reviewDueAt)}
                </small>
              </span>
              <span className={`risk risk-${item.riskLevel}`}>{item.riskLevel}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
