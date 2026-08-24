"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

/**
 * Scientific Reader (Phase 6).
 * - Desktop: fixed contents sidebar + article column.
 * - Mobile: collapsible [Contents], near-fullscreen article.
 * - Text selection -> Highlight / Note / Copy popover.
 * - Highlights restore per paper+section via existing /api/highlights.
 * - Find-in-paper runs fully client-side over the loaded document.
 * - Reading progress: debounced scroll -> /api/history progress.
 */

interface DocBlockP { type: "p"; html: string; text: string }
interface DocBlockF {
  type: "figure";
  id: string | null;
  label: string | null;
  captionHtml: string;
  captionText: string;
  imageUrl: string | null;
}
interface DocBlockT {
  type: "table";
  id: string | null;
  label: string | null;
  captionHtml: string;
  captionText: string;
  tableHtml: string;
}
type DocBlock = DocBlockP | DocBlockF | DocBlockT;

interface Section {
  anchor: string;
  title: string;
  level: number;
  blocks: DocBlock[];
}
interface Reference {
  index: number;
  html: string;
  text: string;
  doi: string | null;
}
export interface ReaderDoc {
  paperId: string;
  title: string | null;
  authors: { name: string }[];
  journal: string | null;
  year: number | null;
  doi: string | null;
  sections: Section[];
  references: Reference[];
}

interface HighlightItem {
  id: number;
  sectionAnchor: string | null;
  text: string;
  note: string | null;
}

const PROGRESS_DEBOUNCE_MS = 5000;

export function Reader({ doc, initialProgress }: { doc: ReaderDoc; initialProgress: number | null }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [highlights, setHighlights] = useState<HighlightItem[]>([]);
  const [activeAnchor, setActiveAnchor] = useState<string>(doc.sections[0]?.anchor ?? "");
  const [tocOpen, setTocOpen] = useState(false);
  const [sel, setSel] = useState<{ x: number; y: number; text: string; anchor: string } | null>(null);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // find-in-paper state
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findIndex, setFindIndex] = useState(0);
  const articleRef = useRef<HTMLDivElement>(null);
  const savedProgressRef = useRef(initialProgress ?? 0);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setAuthed(Boolean(d?.user)))
      .catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    if (!authed || !doc.paperId) return;
    fetch(`/api/highlights?paperKey=${encodeURIComponent(doc.paperId)}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setHighlights(d.items ?? []))
      .catch(() => undefined);
  }, [authed, doc.paperId]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  // ---- selection handling -------------------------------------------------
  useEffect(() => {
    function onMouseUp() {
      // let click-away clear the popover
      setTimeout(() => {
        const s = window.getSelection();
        if (!s || s.isCollapsed || !articleRef.current) return setSel(null);
        if (!articleRef.current.contains(s.anchorNode)) return setSel(null);
        const text = s.toString().trim();
        if (text.length < 2) return setSel(null);
        const range = s.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        // find enclosing section anchor
        let node: Node | null = range.startContainer;
        let anchor = "";
        while (node && node !== articleRef.current) {
          if (node instanceof HTMLElement && node.dataset.anchor) {
            anchor = node.dataset.anchor;
            break;
          }
          node = node.parentNode;
        }
        setSel({ x: rect.left + rect.width / 2, y: rect.top, text, anchor });
      }, 10);
    }
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, []);

  async function saveHighlight(withNote: boolean) {
    if (!sel) return;
    if (authed === false) {
      window.location.href = `/login?next=${encodeURIComponent(`/read/${encodeURIComponent(doc.paperId)}`)}`;
      return;
    }
    const body = {
      paperKey: doc.paperId,
      text: sel.text.slice(0, 2000),
      sectionAnchor: sel.anchor || null,
      ...(withNote ? { note: (noteDraft ?? "").slice(0, 2000) } : {}),
    };
    const res = await fetch("/api/highlights", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const created = await res.json();
      setHighlights((h) => [
        { id: created.id, sectionAnchor: sel.anchor, text: body.text, note: (withNote ? body.note : null) ?? null },
        ...h,
      ]);
      showToast(withNote ? "Note saved" : "Highlight saved");
    } else if (res.status === 401) {
      window.location.href = `/login?next=${encodeURIComponent(`/read/${encodeURIComponent(doc.paperId)}`)}`;
    } else {
      showToast("Could not save. Try again.");
    }
    setNoteDraft(null);
    setSel(null);
    window.getSelection()?.removeAllRanges();
  }

  // ---- find in paper ------------------------------------------------------
  const flatParagraphs = useMemo(
    () =>
      doc.sections.flatMap((s) =>
        s.blocks.filter((b): b is DocBlockP => b.type === "p").map((b) => ({ anchor: s.anchor, text: b.text }))
      ),
    [doc]
  );
  const findMatches = useMemo(() => {
    const q = findQuery.trim().toLowerCase();
    if (q.length < 3) return [];
    const out: { anchor: string; snippet: string }[] = [];
    for (const p of flatParagraphs) {
      const lower = p.text.toLowerCase();
      let idx = lower.indexOf(q);
      while (idx !== -1 && out.length < 200) {
        out.push({
          anchor: p.anchor,
          snippet: p.text.slice(Math.max(0, idx - 40), idx + q.length + 40),
        });
        idx = lower.indexOf(q, idx + q.length);
      }
    }
    return out;
  }, [findQuery, flatParagraphs]);

  function gotoMatch(i: number) {
    if (findMatches.length === 0) return;
    const wrapped = ((i % findMatches.length) + findMatches.length) % findMatches.length;
    setFindIndex(wrapped);
    const m = findMatches[wrapped];
    scrollToSection(m.anchor);
  }

  // ---- TOC / scroll spy + progress ---------------------------------------
  const scrollToSection = useCallback((anchor: string) => {
    const el = document.getElementById(`sec-${anchor}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTocOpen(false);
  }, []);

  useEffect(() => {
    function onScroll() {
      if (!articleRef.current) return;
      const secs = Array.from(articleRef.current.querySelectorAll<HTMLElement>("[data-anchor]"));
      let current = secs[0]?.dataset.anchor ?? "";
      for (const s of secs) {
        if (s.getBoundingClientRect().top <= 120) current = s.dataset.anchor ?? current;
        else break;
      }
      setActiveAnchor(current);

      // Debounced progress write.
      const total = document.documentElement.scrollHeight - window.innerHeight;
      const pct = total > 0 ? Math.min(100, Math.round((window.scrollY / total) * 100)) : 0;
      window.clearTimeout(savedProgressRef.current as unknown as number);
      const t = window.setTimeout(() => {
        if (authed && pct > savedProgressRef.current) {
          savedProgressRef.current = pct;
          fetch("/api/history", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              paperKey: doc.paperId,
              progress: pct,
              work: { title: doc.title, authors: doc.authors.slice(0, 5).map((a) => ({ name: a.name })), publicationYear: doc.year },
            }),
          }).catch(() => undefined);
        }
      }, PROGRESS_DEBOUNCE_MS);
      savedProgressRef.current = savedProgressRef.current; // no-op keep ref
      (savedProgressRef as unknown as { timer?: number }).timer = t;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [doc, authed]);

  const highlightAnchors = useMemo(() => new Set(highlights.map((h) => h.sectionAnchor)), [highlights]);

  return (
    <div className="min-h-screen bg-[var(--cf-bg)]">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-[var(--cf-border)] bg-[var(--cf-bg)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link href={doc.doi ? `/paper/${encodeURIComponent(`doi:${doc.doi}`)}` : "/"} className="text-sm text-[var(--cf-text-muted)] hover:text-[var(--cf-text)]">
            ←
          </Link>
          <button
            onClick={() => setTocOpen((v) => !v)}
            className="rounded-full border border-[var(--cf-border)] px-3 py-1 text-xs font-medium lg:hidden"
          >
            Contents
          </button>
          <span className="truncate text-sm text-[var(--cf-text-muted)]">Cogniflux Reader</span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setFindOpen((v) => !v)} className="rounded-full border border-[var(--cf-border)] px-3 py-1 text-xs">
              Find
            </button>
            {authed && <SaveButton paperId={doc.paperId} title={doc.title} authors={doc.authors} year={doc.year} journal={doc.journal} doi={doc.doi} onSaved={() => showToast("Saved to Library")} />}
          </div>
        </div>
        {findOpen && (
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 pb-3">
            <input
              autoFocus
              value={findQuery}
              onChange={(e) => {
                setFindQuery(e.target.value);
                setFindIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") gotoMatch(findIndex + (e.shiftKey ? -1 : 1));
                if (e.key === "Escape") setFindOpen(false);
              }}
              placeholder="Find in paper…"
              className="w-full rounded-lg border border-[var(--cf-border)] bg-[var(--cf-surface)] px-3 py-1.5 text-sm outline-none focus:border-[var(--cf-accent-strong)]"
            />
            <span className="whitespace-nowrap text-xs text-[var(--cf-text-muted)]">
              {findMatches.length > 0 ? `${findIndex + 1}/${findMatches.length}` : findQuery.trim().length >= 3 ? "0/0" : ""}
            </span>
            <button onClick={() => gotoMatch(findIndex - 1)} className="px-2 text-sm" aria-label="Previous match">↑</button>
            <button onClick={() => gotoMatch(findIndex + 1)} className="px-2 text-sm" aria-label="Next match">↓</button>
            <button onClick={() => { setFindOpen(false); setFindQuery(""); }} className="px-2 text-sm text-[var(--cf-text-muted)]">✕</button>
          </div>
        )}
      </header>

      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-8">
        {/* Sidebar (desktop) */}
        <nav className="hidden w-56 shrink-0 lg:block" aria-label="Table of contents">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--cf-text-muted)]">Contents</p>
          <ul className="space-y-1.5 text-sm">
            {tocEntries(doc.sections).map(([anchor, title]) => (
              <li key={anchor}>
                <button
                  onClick={() => scrollToSection(anchor)}
                  className={`block w-full truncate rounded-md px-2 py-1 text-left transition-colors ${
                    activeAnchor === anchor
                      ? "bg-[var(--cf-surface)] font-medium text-[var(--cf-accent-strong)]"
                      : "text-[var(--cf-text-muted)] hover:bg-[var(--cf-surface)]"
                  } ${highlightAnchors.has(anchor) ? "border-l-2 border-[var(--cf-accent-strong)] pl-2" : ""}`}
                >
                  {title}
                </button>
              </li>
            ))}
            {doc.references.length > 0 && (
              <li>
                <button
                  onClick={() => scrollToSection("references")}
                  className={`block w-full rounded-md px-2 py-1 text-left ${
                    activeAnchor === "references" ? "font-medium text-[var(--cf-accent-strong)]" : "text-[var(--cf-text-muted)]"
                  }`}
                >
                  References ({doc.references.length})
                </button>
              </li>
            )}
          </ul>
        </nav>

        {/* Mobile TOC */}
        {tocOpen && (
          <div className="fixed inset-x-4 top-16 z-20 max-h-[70vh] overflow-auto rounded-xl border border-[var(--cf-border)] bg-[var(--cf-surface)] p-4 shadow-lg lg:hidden">
            <ul className="space-y-2 text-sm">
              {tocEntries(doc.sections).map(([anchor, title]) => (
                <li key={anchor}>
                  <button onClick={() => scrollToSection(anchor)} className="block w-full text-left">{title}</button>
                </li>
              ))}
              {doc.references.length > 0 && (
                <li><button onClick={() => scrollToSection("references")} className="block w-full text-left">References ({doc.references.length})</button></li>
              )}
            </ul>
          </div>
        )}

        {/* Article */}
        <article ref={articleRef} className="min-w-0 flex-1">
          <h1 className="text-balance text-2xl font-semibold leading-snug tracking-tight sm:text-3xl">{doc.title}</h1>
          <p className="mt-3 text-sm text-[var(--cf-text-muted)]">
            {doc.authors.slice(0, 8).map((a) => a.name).join(", ")}
            {doc.authors.length > 8 ? " et al." : ""}
          </p>
          <p className="mt-1 text-sm text-[var(--cf-text-muted)]">
            {[doc.journal, doc.year, doc.doi ? `DOI: ${doc.doi}` : null].filter(Boolean).join(" · ")}
          </p>

          <div className="reader-body mt-10 space-y-12">
            {doc.sections.map((section) => (
              <section key={section.anchor} id={`sec-${section.anchor}`} data-anchor={section.anchor} className="scroll-mt-24">
                <h2 className="mb-4 text-xl font-semibold tracking-tight">{section.title}</h2>
                <div className="space-y-4">
                  {section.blocks.map((b, i) => {
                    if (b.type === "p") return <Para key={i} block={b} findQuery={findQuery} />;
                    if (b.type === "figure") return <Fig key={i} block={b} />;
                    return <Tbl key={i} block={b} />;
                  })}
                </div>
                {highlightAnchors.has(section.anchor) && (
                  <div className="mt-4 space-y-2 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-surface)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--cf-text-muted)]">Your highlights in this section</p>
                    {highlights
                      .filter((h) => h.sectionAnchor === section.anchor)
                      .map((h) => (
                        <blockquote key={h.id} className="border-l-2 border-[var(--cf-accent-strong)] pl-3 text-sm">
                          “{h.text.length > 220 ? `${h.text.slice(0, 220)}…` : h.text}”
                          {h.note && <footer className="mt-1 text-xs text-[var(--cf-text-muted)]">— {h.note}</footer>}
                        </blockquote>
                      ))}
                  </div>
                )}
              </section>
            ))}

            {doc.references.length > 0 && (
              <section id="sec-references" data-anchor="references" className="scroll-mt-24">
                <h2 className="mb-4 text-xl font-semibold tracking-tight">References</h2>
                <ol className="space-y-3 text-sm leading-relaxed">
                  {doc.references.map((r) => (
                    <li key={r.index} className="flex gap-3">
                      <span className="w-8 shrink-0 text-right tabular-nums text-[var(--cf-text-muted)]">{r.index}.</span>
                      <span className="ref-html min-w-0 [&_a]:break-all [&_a]:text-[var(--cf-accent-strong)]" dangerouslySetInnerHTML={{ __html: r.html }} />
                      {r.doi && (
                        <Link
                          href={`/paper/${encodeURIComponent(`doi:${r.doi}`)}`}
                          className="shrink-0 self-start rounded-md border border-[var(--cf-border)] px-2 py-0.5 text-xs hover:border-[var(--cf-accent-strong)]"
                          title="Open in Cogniflux"
                        >
                          ↗
                        </Link>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        </article>
      </div>

      {/* Selection popover */}
      {sel && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => { setSel(null); setNoteDraft(null); }} />
          <div
            className="fixed z-40 -translate-x-1/2 -translate-y-full rounded-xl border border-[var(--cf-border)] bg-[var(--cf-surface)] p-1.5 shadow-lg"
            style={{ left: Math.max(80, Math.min(sel.x, (typeof window !== "undefined" ? window.innerWidth : 400) - 80)), top: sel.y - 8 }}
          >
            {noteDraft === null ? (
              <div className="flex items-center gap-1">
                <button onClick={() => saveHighlight(false)} className="rounded-lg px-3 py-1.5 text-sm hover:bg-[var(--cf-border)]">Highlight</button>
                <button onClick={() => setNoteDraft("")} disabled={authed === false} className="rounded-lg px-3 py-1.5 text-sm hover:bg-[var(--cf-border)] disabled:opacity-40">Note</button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(sel.text).then(() => showToast("Copied"));
                    setSel(null);
                  }}
                  className="rounded-lg px-3 py-1.5 text-sm hover:bg-[var(--cf-border)]"
                >
                  Copy
                </button>
              </div>
            ) : (
              <div className="flex w-72 flex-col gap-2 p-1">
                <textarea
                  autoFocus
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Add a note to this highlight…"
                  rows={3}
                  className="w-full resize-none rounded-lg border border-[var(--cf-border)] bg-[var(--cf-bg)] px-2 py-1.5 text-sm outline-none focus:border-[var(--cf-accent-strong)]"
                />
                <div className="flex justify-end gap-2">
                  <button onClick={() => { setNoteDraft(null); }} className="rounded-lg px-3 py-1 text-sm text-[var(--cf-text-muted)]">Cancel</button>
                  <button onClick={() => saveHighlight(true)} className="rounded-lg bg-[var(--cf-accent-strong)] px-3 py-1 text-sm font-medium text-white">Save note</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[var(--cf-text)] px-4 py-2 text-sm text-[var(--cf-bg)] shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function tocEntries(sections: Section[]): Array<[string, string]> {
  return sections.filter((s) => s.blocks.length > 0).map((s) => [s.anchor, s.title]);
}

/** Render a sanitized paragraph, optionally marking find-in-paper matches. */
function Para({ block, findQuery }: { block: DocBlockP; findQuery: string }) {
  const q = findQuery.trim();
  if (q.length >= 3 && block.text.toLowerCase().includes(q.toLowerCase())) {
    // Mark matches on the plain text, escaping everything first.
    const escaped = block.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const marked = escaped.replace(rx, (m) => `<mark class="bg-yellow-300/60 dark:bg-yellow-500/40">${m}</mark>`);
    return <p className="leading-[1.85] text-[15px]" dangerouslySetInnerHTML={{ __html: marked }} />;
  }
  return <p className="leading-[1.85] text-[15px]" dangerouslySetInnerHTML={{ __html: block.html }} />;
}

function Fig({ block }: { block: DocBlockF }) {
  return (
    <figure className="my-6">
      {block.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- external arbitrary host, next/image needs config
        <img src={block.imageUrl} alt={block.label ?? "Figure"} loading="lazy" className="mx-auto max-w-full rounded-lg" onError={(e) => { e.currentTarget.style.display = "none"; }} />
      ) : (
        <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-[var(--cf-border)] text-xs text-[var(--cf-text-muted)]">
          Figure image not available at source
        </div>
      )}
      {(block.label || block.captionText) && (
        <figcaption className="mt-3 text-sm leading-relaxed text-[var(--cf-text-muted)]">
          {block.label && <span className="mr-2 font-semibold text-[var(--cf-text)]">{block.label}</span>}
          <span dangerouslySetInnerHTML={{ __html: block.captionHtml }} />
        </figcaption>
      )}
    </figure>
  );
}

function Tbl({ block }: { block: DocBlockT }) {
  return (
    <div className="my-6">
      {(block.label || block.captionText) && (
        <p className="mb-2 text-sm text-[var(--cf-text-muted)]">
          {block.label && <span className="mr-2 font-semibold text-[var(--cf-text)]">{block.label}</span>}
          <span dangerouslySetInnerHTML={{ __html: block.captionHtml }} />
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border border-[var(--cf-border)]">
        <div className="reader-table min-w-max p-1 text-sm [&_td]:border-b [&_td]:border-[var(--cf-border)] [&_td]:px-3 [&_td]:py-1.5 [&_th]:border-b [&_th]:border-[var(--cf-border)] [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold" dangerouslySetInnerHTML={{ __html: block.tableHtml }} />
      </div>
    </div>
  );
}

function SaveButton({ paperId, title, authors, year, journal, doi, onSaved }: {
  paperId: string;
  title: string | null;
  authors: { name: string }[];
  year: number | null;
  journal: string | null;
  doi: string | null;
  onSaved: () => void;
}) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  async function save() {
    setState("saving");
    const res = await fetch("/api/library", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        paperKey: paperId,
        work: {
          title: title ?? "Untitled",
          authors: authors.slice(0, 10),
          publicationYear: year,
          journal,
          doi,
          openAccess: { isOa: true, url: doi ? `https://doi.org/${doi}` : null },
        },
      }),
    });
    if (res.status === 201) {
      setState("done");
      onSaved();
    } else if (res.status === 409 || res.status === 200) {
      setState("done");
      onSaved();
    } else if (res.status === 401) {
      window.location.href = `/login?next=${encodeURIComponent(`/read/${encodeURIComponent(paperId)}`)}`;
    } else {
      setState("error");
    }
  }
  return (
    <button
      onClick={save}
      disabled={state === "saving" || state === "done"}
      className="rounded-full bg-[var(--cf-accent-strong)] px-3.5 py-1 text-xs font-medium text-white disabled:opacity-50"
    >
      {state === "done" ? "Saved ✓" : state === "saving" ? "Saving…" : "Save"}
    </button>
  );
}
