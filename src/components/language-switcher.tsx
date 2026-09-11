"use client";
import { useI18n } from "./i18n-provider";
export function LanguageSwitcher() {
  const { locale, t, setLocale } = useI18n();
  return (
    <div className="flex items-center gap-1 rounded-full border border-[var(--cf-border)] p-0.5" aria-label={t.language.switch}>
      <button type="button" onClick={() => setLocale("id")} aria-pressed={locale === "id"} className={`rounded-full px-2.5 py-1 text-xs ${locale === "id" ? "bg-[var(--cf-surface)] font-medium" : "text-[var(--cf-text-muted)]"}`}>ID</button>
      <button type="button" onClick={() => setLocale("en")} aria-pressed={locale === "en"} className={`rounded-full px-2.5 py-1 text-xs ${locale === "en" ? "bg-[var(--cf-surface)] font-medium" : "text-[var(--cf-text-muted)]"}`}>EN</button>
    </div>
  );
}
