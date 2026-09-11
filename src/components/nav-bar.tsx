"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";

export function NavBar({ initialLinks = [] }: { initialLinks?: { href: string; label_key: string; sort_order: number }[] }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const [links,setLinks] = useState(initialLinks);
  useEffect(()=>{if(!links.length) fetch("/api/navigation").then(r=>r.ok?r.json():null).then(d=>d?.items&&setLinks(d.items)).catch(()=>undefined)},[links.length]);
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
      <nav aria-label={t.nav.explore} className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
        <Link href="/" className="font-semibold tracking-tight text-[15px] shrink-0">
          cogniflux
        </Link>
        <div className="flex items-center gap-1 overflow-x-auto">
          {links.map((l) => {
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
                {t.nav[l.label_key as keyof typeof t.nav] ?? l.label_key}
              </Link>
            );
          })}
        </div>
        <div className="ml-auto shrink-0 flex items-center gap-2">
          <LanguageSwitcher />
          {signedIn ? null : (
            <Link href="/login" className="rounded-[10px] border border-[var(--cf-border)] hover:border-[var(--cf-accent)] transition-colors text-sm px-3.5 py-1.5">
              {t.nav.signIn}
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
