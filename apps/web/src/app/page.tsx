const foundations = [
  "Human approval before adverse action",
  "Append-only review history",
  "Versioned policies and automated systems",
  "Sensitive evidence kept off-chain",
];

export default function Home() {
  return (
    <main>
      <section className="shell" aria-labelledby="page-title">
        <header>
          <span className="wordmark">Hollis</span>
          <span className="status">Foundation</span>
        </header>
        <div className="content">
          <p className="eyebrow">Decision control</p>
          <h1 id="page-title">Decisions you can stand behind.</h1>
          <p className="summary">
            Hollis provides the review and evidence infrastructure required before consequential
            automated decisions become actions.
          </p>
          <ul>
            {foundations.map((foundation) => (
              <li key={foundation}>{foundation}</li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
