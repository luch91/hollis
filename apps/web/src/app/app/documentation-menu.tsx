import Link from "next/link";

const documentationLinks = [
  { href: "/docs/how-hollis-works", label: "How Hollis works" },
  { href: "/docs/getting-started", label: "Getting started" },
  { href: "/docs/review-cases", label: "Review cases" },
  { href: "/docs/policies-and-controls", label: "Policies and controls" },
  { href: "/docs/evidence", label: "Evidence" },
  { href: "/docs/genlayer-attestations", label: "GenLayer attestations" },
  { href: "/docs/audit-and-exports", label: "Audit and exports" },
  { href: "/docs/workspace-administration", label: "Workspace administration" },
  { href: "/docs/troubleshooting", label: "Troubleshooting" },
] as const;

export function DocumentationMenu() {
  return (
    <details className="documentation-menu">
      <summary
        aria-label="Open documentation"
        className="product-nav-item documentation-menu-trigger"
      >
        Documentation
      </summary>
      <nav aria-label="Documentation" className="documentation-menu-panel">
        {documentationLinks.map((item) => (
          <Link href={item.href} key={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
    </details>
  );
}
