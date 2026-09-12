"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";

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
    interestsHeading: "Topik yang kamu minati?",
    interestsSub: "Pilih sampai 10 topik untuk feed \"Untukmu\" di beranda.",
    skipInterests: "Lewati",
    done: "Selesai ✓",
    dismiss: "Lewati",
    close: "Tutup",
  },
  en: {
    heading: "Who's learning today?",
    sub: "Pick one to tailor recommendations to your level.",
    saved: (label: string) => `Personalized for ${label}`,
    interestsHeading: "What topics interest you?",
    interestsSub: "Pick up to 10 topics for the \"For you\" feed on your homepage.",
    skipInterests: "Skip",
    done: "Done ✓",
    dismiss: "Skip",
    close: "Close",
  },
} as const;

/** Curated starter interests (Phase 9). Sent verbatim to profiles.interests. */
const INTEREST_CHIPS = [
  "artificial intelligence",
  "machine learning",
  "climate change",
  "health",
  "education",
  "psychology",
  "economics",
  "biology",
  "history",
  "technology",
];

const DISMISS_KEY = "cf:persona-dismissed";

export function PersonaOnboarding() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<"level" | "interests">("level");
  const [picked, setPicked] = useState<string[]>([]);
  const [savingInterests, setSavingInterests] = useState(false);

  const [saving, setSaving] = useState<Level | null>(null);
  const [savedLabel, setSavedLabel] = useState<string | null>(null);
  const { locale } = useI18n();
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage.getItem(DISMISS_KEY)) return;
    let alive = true;
    fetch("/api/preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { profile?: { level?: string | null; locale?: string | null } } | null) => {
        if (!alive || !data?.profile) return;
        // Only show when signed in AND no persona chosen yet.
        if (data.profile.level == null) setVisible(true);
        
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
      setSaveError(null);
      try {
        const res = await fetch("/api/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ level }),
        });
        if (!res.ok) { setSaveError("Could not save your preference. Please try again."); return; }
        const label = PERSONAS.find((p) => p.value === level)?.label ?? "";
        setSavedLabel(label);
        setStep("interests"); // Phase 9: second step collects topic interests
      } finally {
        setSaving(null);
      }
    },
    [dismiss]
  );

  const toggleInterest = useCallback((topic: string) => {
    setPicked((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : prev.length >= 10 ? prev : [...prev, topic],
    );
  }, []);

  const saveInterests = useCallback(
    async (interests: string[]) => {
      setSavingInterests(true);
      setSaveError(null);
      try {
        const res = await fetch("/api/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interests }),
        });
        if (!res.ok) { setSaveError("Could not save your topics. Please try again."); return; }
        dismiss();
      } finally {
        setSavingInterests(false);
      }
    },
    [dismiss]
  );

  if (!visible) return null;
  const t = COPY[locale];

  if (step === "interests") {
    return (
      <div role="dialog" aria-label={t.interestsHeading} className="border-b border-[var(--cf-border)] bg-[var(--cf-surface)]">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">{t.interestsHeading}</p>
              <p className="text-sm text-[var(--cf-text-muted)]">{t.interestsSub}</p>
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

          <div className="mt-3 flex flex-wrap gap-2">
            {INTEREST_CHIPS.map((topic) => {
              const on = picked.includes(topic);
              return (
                <button
                  key={topic}
                  type="button"
                  disabled={savingInterests}
                  aria-pressed={on}
                  onClick={() => toggleInterest(topic)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors disabled:opacity-50 ${
                    on
                      ? "border-[var(--cf-accent)] bg-[var(--cf-accent)] text-white"
                      : "border-[var(--cf-border)] hover:border-[var(--cf-accent)] text-[var(--cf-text-muted)]"
                  }`}
                >
                  {topic}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              disabled={savingInterests || picked.length === 0}
              onClick={() => saveInterests(picked)}
              className="rounded-[10px] bg-[var(--cf-accent)] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
            >
              {savingInterests ? "…" : `${t.done}${picked.length ? ` (${picked.length})` : ""}`}
            </button>
            <button
              type="button"
              disabled={savingInterests}
              onClick={() => saveInterests([])}
              className="text-sm text-[var(--cf-text-muted)] hover:text-[var(--cf-text)] transition-colors px-2 py-2"
            >
              {t.skipInterests}
            </button>
          </div>
          {saveError && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{saveError}</p>}
        </div>
      </div>
    );
  }

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

        {saveError && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{saveError}</p>}
      </div>
    </div>
  );
}
