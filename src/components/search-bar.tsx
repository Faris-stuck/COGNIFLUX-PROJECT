"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n-provider";

export function SearchBar({ initialQuery = "", size = "lg" }: { initialQuery?: string; size?: "lg" | "md" }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const { t } = useI18n();

  function submit(e: FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    router.push(`/search?q=${encodeURIComponent(query)}`);
  }

  return (
    <form onSubmit={submit} role="search" className="w-full">
      <div
        className={`flex items-center gap-2 bg-[var(--cf-surface)] border border-[var(--cf-border)] rounded-[10px] px-4 ${
          size === "lg" ? "py-3.5 shadow-sm focus-within:border-[var(--cf-accent)] transition-colors" : "py-2"
        }`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden className="shrink-0 text-[var(--cf-text-muted)]">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={size === "lg" ? t.home.searchPlaceholder : t.common.search}
          aria-label={t.common.search}
          maxLength={500}
          className={`flex-1 bg-transparent outline-none min-w-0 ${size === "lg" ? "text-base" : "text-sm"}`}
        />
        <button
          type="submit"
          className="shrink-0 rounded-[10px] bg-[var(--cf-accent)] hover:bg-[var(--cf-accent-strong)] active:scale-[0.98] transition text-white text-sm font-medium px-4 py-1.5"
        >
          {t.common.search}
        </button>
      </div>
    </form>
  );
}
