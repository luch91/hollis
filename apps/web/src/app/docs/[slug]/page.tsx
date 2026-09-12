import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDocumentationPage } from "../documentation-content";
import { documentationNavigation, documentationSlugs } from "../documentation-navigation";

export function generateStaticParams() {
  return documentationSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = getDocumentationPage(slug);
  return page
    ? { description: page.description, title: `${page.title} | Hollis Documentation` }
    : { title: "Documentation | Hollis" };
}

export default async function DocumentationPageRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = getDocumentationPage(slug);
  if (!page) notFound();
  const currentIndex = documentationSlugs.indexOf(slug as (typeof documentationSlugs)[number]);
  const previousSlug = currentIndex > 0 ? documentationSlugs[currentIndex - 1] : null;
  const nextSlug = currentIndex >= 0 ? documentationSlugs[currentIndex + 1] : null;
  const labels = new Map(
    documentationNavigation.flatMap((group) => group.items.map((item) => [item.slug, item.label])),
  );

  return (
    <article className="docs-article" id="documentation-content">
      <header className="docs-article-header">
        <p>{page.eyebrow}</p>
        <h1>{page.title}</h1>
        <strong className="docs-article-description">{page.description}</strong>
      </header>
      <div className="docs-article-grid">
        <div className="docs-article-body">
          {page.sections.map((section) => (
            <section aria-labelledby={`${section.id}-title`} id={section.id} key={section.id}>
              <h2 id={`${section.id}-title`}>{section.title}</h2>
              {section.content}
            </section>
          ))}
          <nav aria-label="Documentation pagination" className="docs-pagination">
            {previousSlug ? (
              <Link href={`/docs/${previousSlug}`}>
                <span>Previous</span>
                <strong className="docs-pagination-label">‹ {labels.get(previousSlug)}</strong>
              </Link>
            ) : (
              <span />
            )}
            {nextSlug ? (
              <Link href={`/docs/${nextSlug}`}>
                <span>Next</span>
                <strong className="docs-pagination-label">{labels.get(nextSlug)} ›</strong>
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </div>
        <aside className="docs-on-this-page">
          <strong className="docs-on-this-page-title">On this page</strong>
          <nav aria-label="On this page">
            {page.sections.map((section) => (
              <Link href={`#${section.id}`} key={section.id}>
                {section.title.replace(/^\d+\.\s*/, "")}
              </Link>
            ))}
          </nav>
          <span>{page.sections.length} sections</span>
        </aside>
      </div>
    </article>
  );
}
