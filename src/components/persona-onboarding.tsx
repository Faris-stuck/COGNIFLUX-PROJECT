"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Persona onboarding. Shows a dismissible banner for signed-in users who
 * have not chosen a persona yet (profiles.level is null). Never blocks
 * content — purely a personalization hint. Dismissal persists in
 * localStorage so guests and opted-out users are not nagged.
 */

type Level = "elementary" | "middle" | "high" | "vocational" | "university" | "researcher";

const PERSONAS: { value: Level; label: string }[] = [
  { value: "elementary", label: "SD" },
  { value: "middle", label: "SMP" },
  { value: "high", label: "SMA" },
  { value: "vocational", label: "SMK" },
  { value: "university", label: "Mahasiswa" },
  { value: "researcher", label: "Peneliti" },
];

const COPY = {
  id: {
    heading: "Siapa yang sedang belajar hari ini?",
    sub: "Pilih agar rekomendasi disesuaikan dengan jenjangmu.",
    saved: (label: string) => `Personalized untuk ${label}`,
    dismiss: "Lewati",
    close: "Tutup",
  },
  en: {
    heading: "Who's learning today?",
    sub: "Pick one to tailor recommendations to your level.",
    saved: (label: string) => `Personalized for ${label}`,
    dismiss: "Skip",
    close: "Close",
  },
} as const;

const DISMISS_KEY = "cf:persona-dismissed";

export function PersonaOnboarding() {
  const [visible, setVisible] = useState(false);
  const [locale, setLocale] = useState<"id" | "en">("id");
  const [saving, setSaving] = useState<Level | null>(null);
  const [savedLabel, setSavedLabel] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage.getItem(DISMISS_KEY)) return;
    let alive = true;
    fetch("/api/preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { profile?: { level?: string | null; locale?: string | null } } | null) => {
        if (!alive || !data?.profile) return;
        // Only show when signed in AND no persona chosen yet.
        if (data.profile.level == null) setVisible(true);
        if (data.profile.locale === "en") setLocale("en");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  }, []);

  const choose = useCallback(
    async (level: Level) => {
      setSaving(level);
      try {
        const res = await fetch("/api/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ level }),
        });
        if (!res.ok) return;
        const label = PERSONAS.find((p) => p.value === level)?.label ?? "";
        setSavedLabel(label);
        setTimeout(dismiss, 1800);
      } finally {
        setSaving(null);
      }
    },
    [dismiss]
  );

  if (!visible) return null;
  const t = COPY[locale];

  return (
    <div
      role="dialog"
      aria-label={t.heading}
      className="border-b border-[var(--cf-border)] bg-[var(--cf-surface)]"
    >
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">{t.heading}</p>
            <p className="text-sm text-[var(--cf-text-muted)]">{t.sub}</p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t.close}
            className="shrink-0 text-[var(--cf-text-muted)] hover:text-[var(--cf-text)] transition-colors text-sm px-2 py-1 rounded-[10px]"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {PERSONAS.map((p) => (
            <button
              key={p.value}
              type="button"
              disabled={saving !== null}
              onClick={() => choose(p.value)}
              className="rounded-[10px] border border-[var(--cf-border)] hover:border-[var(--cf-accent)] transition-colors text-sm font-medium px-4 py-4 disabled:opacity-50"
            >
              {saving === p.value ? "…" : p.label}
            </button>
          ))}
        </div>

        {savedLabel && (
          <p className="mt-3 text-sm text-[var(--cf-accent-strong)]">{t.saved(savedLabel)}</p>
        )}
      </div>
    </div>
  );
}
