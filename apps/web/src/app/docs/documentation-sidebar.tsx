"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { documentationNavigation } from "./documentation-navigation";

export function DocumentationSidebar() {
  const pathname = usePathname();
  return (
    <aside className="docs-sidebar">
      <p className="docs-sidebar-title">Documentation</p>
      <nav aria-label="Documentation sections">
        {documentationNavigation.map((group) => (
          <section key={group.label}>
            <strong className="docs-sidebar-group-label">{group.label}</strong>
            {group.items.map((item) => (
              <Link
                aria-current={pathname === item.href ? "page" : undefined}
                className={pathname === item.href ? "active" : undefined}
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </section>
        ))}
      </nav>
    </aside>
  );
}
