import Link from "next/link";
import { HollisBrand } from "../hollis-brand";
import { ThemeToggle } from "../app/theme-toggle";

export function DocumentationHeader() {
  return (
    <header className="docs-header">
      <Link aria-label="Hollis documentation home" className="docs-brand" href="/docs">
        <HollisBrand />
        <span className="docs-section-label">Documentation</span>
      </Link>
      <nav aria-label="Documentation utilities">
        <Link href="/docs/how-hollis-works">How Hollis works</Link>
        <Link href="/docs/security">Security</Link>
        <Link href="/docs/support">Support</Link>
        <ThemeToggle />
        <Link aria-label="Open workspace" className="docs-workspace-link" href="/app">
          <span className="docs-workspace-link-label">Open workspace</span>
          <span aria-hidden="true">›</span>
        </Link>
      </nav>
    </header>
  );
}
