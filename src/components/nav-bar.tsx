"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/explore", label: "Explore" },
  { href: "/research", label: "Research" },
  { href: "/learn", label: "Learn" },
  { href: "/library", label: "Library" },
];

export function NavBar() {
  const pathname = usePathname();
  return (
    <header className="border-b border-[var(--cf-border)] sticky top-0 z-40 bg-[var(--cf-bg)]/90 backdrop-blur">
      <nav aria-label="Primary" className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
        <Link href="/" className="font-semibold tracking-tight text-[15px] shrink-0">
          cogniflux
        </Link>
        <div className="flex items-center gap-1 overflow-x-auto">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`px-3 py-1.5 rounded-[10px] text-sm whitespace-nowrap transition-colors ${
                  active
                    ? "bg-[color-mix(in_srgb,var(--cf-accent)_10%,transparent)] text-[var(--cf-accent-strong)] font-medium"
                    : "text-[var(--cf-text-muted)] hover:text-[var(--cf-text)]"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
