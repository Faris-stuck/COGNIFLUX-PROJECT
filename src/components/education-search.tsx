"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Resource {
  id: string;
  title: string;
  description: string | null;
  authors: { name: string }[];
  publisher: string | null;
  year: number | null;
  language: string;
  educationLevel: string[];
  grade: number | null;
  subject: string[];
  topic: string | null;
  resourceType: string;
  format: string[];
  source: string;
  sourceUrl: string | null;
  readUrl: string | null;
  license: string | null;
  thumbnail: string | null;
}

interface Taxonomy {
  levels: { slug: string; label: { en: string; id: string } }[];
  subjects: { slug: string; label: { en: string; id: string } }[];
}

const TYPE_LABELS: Record<string, string> = {
  textbook: "Textbook",
  article: "Article",
  lesson: "Lesson",
  course: "Course",
  module: "Module",
  exercise: "Exercise",
  reference: "Reference",
  interactive: "Interactive",
  video: "Video",
  other: "Resource",
};

function ResourceCard({ r }: { r: Resource }) {
  const [saved, setSaved] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "busy" | "done" | "auth">("idle");

  async function save() {
    setSaveState("busy");
    try {
      const res = await fetch("/api/library", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          paperKey: r.id,
          work: {
            title: r.title,
            authors: r.authors.slice(0, 10),
            publicationYear: r.year,
            journal: r.publisher,
            doi: null,
            openAccess: { isOa: true, url: r.readUrl ?? r.sourceUrl },
          },
        }),
      });
      if (res.status === 401) setSaveState("auth");
      else if (res.ok) {
        setSaved(true);
        setSaveState("done");
      } else setSaveState("idle");
    } catch {
      setSaveState("idle");
    }
  }

  const levelLabel = r.educationLevel[0] ?? null;

  return (
    <article className="border border-[var(--cf-border)] rounded-[10px] bg-[var(--cf-surface)] p-4 flex flex-col gap-2">
      <Link href={`/education/${encodeURIComponent(r.id)}`} className="font-medium hover:text-[var(--cf-accent-strong)] transition-colors">
        {r.title}
      </Link>
      <p className="text-sm text-[var(--cf-text-muted)]">
        {[r.authors[0]?.name ?? r.publisher, r.year, levelLabel, r.subject[0], r.language.toUpperCase(), TYPE_LABELS[r.resourceType] ?? "Resource"]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <div className="flex items-center gap-2 mt-auto pt-1">
        <a
          href={r.readUrl ?? r.sourceUrl ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-[10px] border border-[var(--cf-border)] hover:border-[var(--cf-accent)] transition-colors px-3 py-1.5 text-sm"
        >
          Open
        </a>
        <button
          onClick={save}
          disabled={saved || saveState === "busy"}
          className="rounded-[10px] border border-[var(--cf-border)] hover:border-[var(--cf-accent)] transition-colors px-3 py-1.5 text-sm disabled:opacity-60"
        >
          {saveState === "auth" ? "Sign in to save" : saved || saveState === "done" ? "Saved ✓" : saveState === "busy" ? "Saving…" : "Save"}
        </button>
      </div>
    </article>
  );
}

export function EducationSearch() {
  const [q, setQ] = useState("");
  const [level, setLevel] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [results, setResults] = useState<Resource[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/education/taxonomy")
      .then((r) => r.json())
      .then(setTaxonomy)
      .catch(() => {});
  }, []);

  const runSearch = useCallback(
    async (query: string) => {
      if (!query.trim()) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ q: query });
        if (level.length) params.set("level", level.join(","));
        if (subject) params.set("subject", subject);
        const res = await fetch(`/api/education/search?${params}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setResults(data.resources as Resource[]);
        setTotal(data.total as number);
      } catch {
        setResults(null);
        setError("We couldn't retrieve learning resources right now. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [level, subject]
  );

  return (
    <div>
      {/* Search */}
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(q);
        }}
        className="flex items-center gap-2 bg-[var(--cf-surface)] border border-[var(--cf-border)] rounded-[10px] px-4 py-3 focus-within:border-[var(--cf-accent)] transition-colors"
      >
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search learning materials… (e.g. grade 8 mathematics / matematika kelas 8)"
          className="flex-1 bg-transparent outline-none text-[15px]"
          aria-label="Search learning materials"
        />
        <button type="submit" className="rounded-[8px] bg-[var(--cf-accent)] text-white text-sm px-3.5 py-1.5">
          Search
        </button>
      </form>

      {/* Browse by level */}
      <div className="mt-4">
        <p className="text-sm text-[var(--cf-text-muted)] mb-2">Browse by level</p>
        <div role="list" className="flex flex-wrap gap-2">
          {(taxonomy?.levels ?? []).map((l) => {
            const active = level.includes(l.slug);
            return (
              <button
                key={l.slug}
                role="listitem"
                aria-pressed={active}
                onClick={() => {
                  setLevel(active ? level.filter((x) => x !== l.slug) : [...level, l.slug]);
                  if (!active && q.trim()) setTimeout(() => runSearch(q), 0);
                }}
                className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                  active
                    ? "border-[var(--cf-accent)] bg-[color-mix(in_srgb,var(--cf-accent)_10%,transparent)] text-[var(--cf-accent-strong)]"
                    : "border-[var(--cf-border)] bg-[var(--cf-surface)] text-[var(--cf-text-muted)] hover:text-[var(--cf-text)]"
                }`}
              >
                {l.label.en} <span className="opacity-60">/ {l.label.id}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Subject filter - only shown once there are results (spec: no filters without support) */}
      {results && results.length > 0 && taxonomy && (
        <div className="mt-3 flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-[var(--cf-text-muted)] mr-1">Subject:</span>
          <button
            onClick={() => setSubject("")}
            className={`rounded-full border px-2.5 py-1 text-xs ${!subject ? "border-[var(--cf-accent)] text-[var(--cf-accent-strong)]" : "border-[var(--cf-border)] text-[var(--cf-text-muted)]"}`}
          >
            All
          </button>
          {taxonomy.subjects.slice(0, 12).map((s) => (
            <button
              key={s.slug}
              onClick={() => setSubject(s.slug === subject ? "" : s.slug)}
              className={`rounded-full border px-2.5 py-1 text-xs ${subject === s.slug ? "border-[var(--cf-accent)] text-[var(--cf-accent-strong)]" : "border-[var(--cf-border)] text-[var(--cf-text-muted)] hover:text-[var(--cf-text)]"}`}
            >
              {s.label.en}
            </button>
          ))}
        </div>
      )}

      {/* States */}
      {loading && <p className="mt-8 text-sm text-[var(--cf-text-muted)]">Searching learning resources…</p>}
      {error && <p className="mt-8 text-sm">{error}</p>}
      {!loading && !error && results === null && (
        <p className="mt-8 text-sm text-[var(--cf-text-muted)] max-w-[60ch]">
          Try a search like “grade 8 biology” or browse a level above. Resources come from OpenStax and the Open Textbook
          Library — free and openly licensed.
        </p>
      )}
      {!loading && results?.length === 0 && (
        <div className="mt-8">
          <p className="font-medium">No learning resources found.</p>
          <p className="text-sm text-[var(--cf-text-muted)] mt-1">Try a different term or remove some filters.</p>
        </div>
      )}

      {/* Results */}
      {!loading && results && results.length > 0 && (
        <>
          <p className="text-sm text-[var(--cf-text-muted)] mt-6 mb-3">About {new Intl.NumberFormat().format(total)} resources</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {results.map((r) => (
              <ResourceCard key={r.id} r={r} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
