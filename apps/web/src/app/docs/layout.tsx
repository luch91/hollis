import Link from "next/link";
import type { ReactNode } from "react";
import { DocumentationHeader } from "./documentation-header";
import { DocumentationSidebar } from "./documentation-sidebar";

export default function DocumentationLayout({ children }: { children: ReactNode }) {
  return (
    <main className="docs-shell">
      <a className="docs-skip-link" href="#documentation-content">
        Skip to documentation
      </a>
      <DocumentationHeader />
      <div className="docs-frame">
        <DocumentationSidebar />
        {children}
      </div>
      <footer className="docs-footer">
        <span>Hollis documentation</span>
        <nav aria-label="Legal and support">
          <Link href="/docs/privacy">Privacy</Link>
          <Link href="/docs/terms">Terms</Link>
          <Link href="/docs/security">Security</Link>
          <Link href="/docs/support">Support</Link>
        </nav>
      </footer>
    </main>
  );
}
