"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";

interface Paper {
  n: number;
  id: string;
  title: string;
  year: number | null;
  url: string | null;
}

interface AskResponse {
  authenticated?: boolean;
  conversationId?: number | null;
  degraded?: boolean;
  reason?: string;
  answer?: string | null;
  papers?: Paper[];
  cited?: number[];
  model?: string;
}

interface Turn {
  question: string;
  res: AskResponse;
}

/** Render [n] citation markers as links to the paper list anchors. */
function withCitations(text: string, turnPrefix = ""): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /\[(\d{1,2})\]/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    const n = Number(m[1]);
    parts.push(
      <sup key={`${m.index}-${n}`}>
        <a href={`#paper-${turnPrefix}${n}`} className="text-[var(--cf-accent)] font-semibold no-underline">
          [{n}]
        </a>
      </sup>,
    );
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function AskPanel({ locale }: { locale: "id" | "en" }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const conversationId = useRef<number | null>(null);
  const threadEnd = useRef<HTMLDivElement | null>(null);

  const labels =
    locale === "id"
      ? {
          placeholder: "Tanya sesuatu tentang topik riset…",
          followUp: "Lanjutkan percakapan…",
          ask: "Tanya",
          loading: "Mencari & menyusun jawaban…",
          aiOff: "AI sedang nonaktif — ini hasil penelusuran terbuktinya.",
          noResults: "Tidak ada paper yang relevan untuk pertanyaan ini.",
          invalid: "Pertanyaan minimal 5 karakter.",
          sources: "Sumber",
          followUpHint: "Jawaban berikutnya memakai konteks percakapan ini.",
        }
      : {
          placeholder: "Ask about a research topic…",
          followUp: "Continue the conversation…",
          ask: "Ask",
          loading: "Retrieving & composing answer…",
          aiOff: "AI is off — here are the retrieved sources instead.",
          noResults: "No relevant papers found for this question.",
          invalid: "Question must be at least 5 characters.",
          sources: "Sources",
          followUpHint: "Later answers use this conversation as context.",
        };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const question = q.trim();
    if (question.length < 5) {
      setError(labels.invalid);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, locale, conversationId: conversationId.current ?? undefined }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => null);
        setError(body?.error === "rate_limited" ? (body.message ?? "Too many") : "request_failed");
        return;
      }
      const res = (await r.json()) as AskResponse;
      // Server only assigns a real conversation to signed-in users; guests
      // keep null so every question stays single-turn (no shared state).
      conversationId.current = res.authenticated && res.conversationId ? res.conversationId : null;
      setTurns((prev) => [...prev, { question, res }]);
      setQ("");
      queueMicrotask(() => threadEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
    } catch {
      setError("network_error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      <form onSubmit={submit} className="flex gap-2 sticky top-16 bg-[var(--cf-bg)] py-2 z-10">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={turns.length === 0 ? labels.placeholder : labels.followUp}
          aria-label={turns.length === 0 ? labels.placeholder : labels.followUp}
          maxLength={400}
          className="flex-1 bg-[var(--cf-surface)] border border-[var(--cf-border)] rounded-[10px] px-4 py-3 text-[15px]"
        />
        <button
          type="submit"
          disabled={busy}
          className="px-5 py-3 rounded-[10px] bg-[var(--cf-accent)] text-white font-medium disabled:opacity-50"
        >
          {busy ? "…" : labels.ask}
        </button>
      </form>

      {turns.length > 0 && conversationId.current && (
        <p className="text-xs text-[var(--cf-text-muted)] mt-2">{labels.followUpHint}</p>
      )}
      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      {busy && <p className="text-sm text-[var(--cf-text-muted)] mt-4">{labels.loading}</p>}

      <div className="mt-4 space-y-10">
        {turns.map((t, i) => (
          <div key={i} className="space-y-4">
            <p className="text-sm font-medium text-[var(--cf-text-muted)]">{t.question}</p>
            <div className="space-y-5">
              {t.res.answer && (
                <div className="bg-[var(--cf-surface)] border border-[var(--cf-border)] rounded-[10px] p-5">
                  <p className="whitespace-pre-wrap leading-relaxed">{withCitations(t.res.answer, `${i}-`)}</p>
                  {t.res.model && (
                    <p className="text-xs text-[var(--cf-text-muted)] mt-3">
                      {t.res.model} · {t.res.cited?.length ?? 0} citations
                    </p>
                  )}
                </div>
              )}
              {t.res.degraded && t.res.papers && t.res.papers.length > 0 && (
                <p className="text-sm text-[var(--cf-text-muted)]">{labels.aiOff}</p>
              )}
              {t.res.papers && t.res.papers.length > 0 ? (
                <>
                  {turns.length > 1 && (
                    <p className="text-xs uppercase tracking-wide text-[var(--cf-text-muted)]">
                      {labels.sources} #{i + 1}
                    </p>
                  )}
                  <ol className="space-y-3">
                    {t.res.papers.map((p) => (
                      <li
                        key={`${i}-${p.id}`}
                        id={`paper-${i}-${p.n}`}
                        className="bg-[var(--cf-surface)] border border-[var(--cf-border)] rounded-[10px] p-4"
                      >
                        <span className="text-[var(--cf-accent)] font-semibold mr-2">[{p.n}]</span>
                        {p.url ? (
                          <Link href={p.url} className="font-medium hover:underline">
                            {p.title}
                          </Link>
                        ) : (
                          <span className="font-medium">{p.title}</span>
                        )}
                        {p.year && <span className="text-sm text-[var(--cf-text-muted)]"> · {p.year}</span>}
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                !t.res.answer && !busy && <p className="text-sm text-[var(--cf-text-muted)]">{labels.noResults}</p>
              )}
            </div>
          </div>
        ))}
        <div ref={threadEnd} />
      </div>
    </div>
  );
}
