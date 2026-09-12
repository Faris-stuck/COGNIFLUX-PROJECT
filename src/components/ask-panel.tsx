"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";

interface Paper {
  n: number;
  id: string;
  title: string;
  year: number | null;
  url: string | null;
}

interface AskResponse {
  degraded?: boolean;
  reason?: string;
  answer?: string | null;
  papers?: Paper[];
  cited?: number[];
  model?: string;
}

/** Render [n] citation markers as links to the paper list anchors. */
function withCitations(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /\[(\d{1,2})\]/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    const n = Number(m[1]);
    parts.push(
      <sup key={`${m.index}-${n}`}>
        <a href={`#paper-${n}`} className="text-[var(--cf-accent)] font-semibold no-underline">
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
  const [res, setRes] = useState<AskResponse | null>(null);

  const labels =
    locale === "id"
      ? {
          placeholder: "Tanya sesuatu tentang topik riset…",
          ask: "Tanya",
          loading: "Mencari & menyusun jawaban…",
          aiOff: "AI sedang nonaktif — ini hasil penelusuran terbuktinya.",
          noResults: "Tidak ada paper yang relevan untuk pertanyaan ini.",
          invalid: "Pertanyaan minimal 5 karakter.",
        }
      : {
          placeholder: "Ask about a research topic…",
          ask: "Ask",
          loading: "Retrieving & composing answer…",
          aiOff: "AI is off — here are the retrieved sources instead.",
          noResults: "No relevant papers found for this question.",
          invalid: "Question must be at least 5 characters.",
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
    setRes(null);
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, locale }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => null);
        setError(body?.error === "rate_limited" ? (body.message ?? "Too many") : "request_failed");
        return;
      }
      setRes((await r.json()) as AskResponse);
    } catch {
      setError("network_error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={labels.placeholder}
          aria-label={labels.placeholder}
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

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      {busy && <p className="text-sm text-[var(--cf-text-muted)] mt-4">{labels.loading}</p>}

      {res && (
        <div className="mt-6 space-y-5">
          {res.answer && (
            <div className="bg-[var(--cf-surface)] border border-[var(--cf-border)] rounded-[10px] p-5">
              <p className="whitespace-pre-wrap leading-relaxed">{withCitations(res.answer)}</p>
              {res.model && (
                <p className="text-xs text-[var(--cf-text-muted)] mt-3">
                  {res.model} · {res.cited?.length ?? 0} citations
                </p>
              )}
            </div>
          )}
          {res.degraded && res.papers && res.papers.length > 0 && (
            <p className="text-sm text-[var(--cf-text-muted)]">{labels.aiOff}</p>
          )}
          {res.papers && res.papers.length > 0 ? (
            <ol className="space-y-3">
              {res.papers.map((p) => (
                <li
                  key={p.id}
                  id={`paper-${p.n}`}
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
          ) : (
            !res.answer && !busy && <p className="text-sm text-[var(--cf-text-muted)]">{labels.noResults}</p>
          )}
        </div>
      )}
    </div>
  );
}
