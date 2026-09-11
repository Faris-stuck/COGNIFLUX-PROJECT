"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";

interface WorkLite {
  title: string;
  authors: { name: string }[];
  publicationYear?: number | null;
  journal?: string | null;
  doi?: string | null;
  openAccess: { isOa: boolean; url?: string | null };
}

/**
 * Save-to-library toggle + passive reading-history recording.
 * Guests get an honest sign-in hint instead of a broken action.
 * History is recorded ONLY for signed-in users (privacy: no guest tracking).
 */
export function PaperActions({ paperKey, work }: { paperKey: string; work: WorkLite }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);
  const [hint, setHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await fetch("/api/auth/me");
        if (!alive) return;
        if (!me.ok) {
          setAuthed(false);
          return;
        }
        setAuthed(true);
        // record history once per mount for signed-in users
        fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paperKey, work }),
        }).catch(() => {});
        const lib = await fetch(`/api/library`);
        if (lib.ok && alive) {
          const data = (await lib.json()) as { items: { paper_key: string }[] };
          setSaved(data.items.some((i) => i.paper_key === paperKey));
        }
      } catch {
        if (alive) setAuthed(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [paperKey, work]);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setActionError(false);
    try {
      if (!saved) {
        const res = await fetch("/api/library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paperKey, work }),
        });
        if (res.status === 401) {
          setAuthed(false);
          return;
        }
        if (!res.ok) { setActionError(true); return; }
        setSaved(true);
      } else {
        const res = await fetch(`/api/library?paperKey=${encodeURIComponent(paperKey)}`, { method: "DELETE" });
        if (!res.ok) { setActionError(true); return; }
        setSaved(false);
      }
    } finally {
      setBusy(false);
    }
  }

  if (authed === null) return <div aria-hidden className="h-[38px]" />;

  if (authed === false) {
    return (
      <span className="relative inline-flex items-center gap-2">
        <button
          type="button"
          onClick={() => setHint((h) => !h)}
          className="rounded-[10px] border border-[var(--cf-border)] hover:border-[var(--cf-accent)] transition-colors text-sm px-4 py-2"
        >
          {t.common.save}
        </button>
        {hint && (
          <span role="status" className="absolute top-full mt-2 left-0 whitespace-nowrap text-xs bg-[var(--cf-surface-raised,var(--cf-surface))] border border-[var(--cf-border)] rounded-[8px] px-3 py-1.5 shadow-sm z-10">
            {t.common.signInToSave}.
            <span className="ml-1"><a href="/login" className="text-[var(--cf-accent-strong)] underline">{t.nav.signIn}</a></span>
          </span>
        )}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      className={`rounded-[10px] transition text-sm font-medium px-4 py-2 border ${
        saved
          ? "border-[var(--cf-accent)] text-[var(--cf-accent-strong)]"
          : "border-[var(--cf-border)] hover:border-[var(--cf-accent)]"
      } disabled:opacity-50`}
    >
      {busy ? "…" : saved ? t.common.saved : actionError ? t.common.retry : t.common.save}
    </button>
  );
}
