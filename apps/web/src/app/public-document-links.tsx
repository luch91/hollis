import Link from "next/link";

export function PublicDocumentLinks() {
  return (
    <nav aria-label="Hollis information" className="public-document-links">
      <Link href="/docs/how-hollis-works">Documentation</Link>
      <Link href="/docs/privacy">Privacy</Link>
      <Link href="/docs/security">Security</Link>
      <Link href="/docs/terms">Terms</Link>
      <Link href="/docs/support">Support</Link>
    </nav>
  );
}
