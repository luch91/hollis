import Image from "next/image";

export function OperationalPageHeader({
  eyebrow,
  title,
  summary,
  titleId,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  titleId?: string;
}) {
  return (
    <header className="petrol-page-intro">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 id={titleId}>{title}</h1>
        <p>{summary}</p>
      </div>
      <aside className="petrol-brand-art" aria-label="Hollis decision workflow">
        <Image
          alt="Abstract petrol and ice prism"
          height={320}
          priority
          src="/assets/petrol-prism.webp"
          width={720}
        />
        <div>
          <strong>People. Policy. Evidence.</strong>
          <span>One accountable record.</span>
        </div>
      </aside>
    </header>
  );
}
