"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/explore", label: "Explore" },
  { href: "/research", label: "Research" },
  { href: "/learn", label: "Learn" },
  { href: "/library", label: "Library" },
];

export function NavBar() {
  const pathname = usePathname();
  // Signed-in indicator only; the Library page itself handles guest vs member.
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me")
      .then((r) => {
        if (alive) setSignedIn(r.ok);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pathname]);

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
        <div className="ml-auto shrink-0">
          {signedIn ? null : (
            <Link href="/login" className="rounded-[10px] border border-[var(--cf-border)] hover:border-[var(--cf-accent)] transition-colors text-sm px-3.5 py-1.5">
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
