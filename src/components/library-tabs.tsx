"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface SavedItem {
  id: number;
  paper_key: string;
  title: string | null;
  first_author: string | null;
  year: string | null;
}
interface Collection {
  id: number;
  name: string;
  createdAt: string;
  paperCount: number;
}
interface HistoryItem {
  paperKey: string;
  title: string | null;
  firstAuthor: string | null;
  year: string | null;
  progress: number | null;
  readAt: string;
}

type Tab = "saved" | "collections" | "history";

const TABS: { key: Tab; label: string }[] = [
  { key: "saved", label: "Saved" },
  { key: "collections", label: "Collections" },
  { key: "history", label: "History" },
];

export function LibraryTabs() {
  const [tab, setTab] = useState<Tab>("saved");
  return (
    <div>
      <nav role="tablist" aria-label="Library sections" className="flex gap-1 border-b border-[var(--cf-border)] mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? "border-[var(--cf-accent)] text-[var(--cf-text)] font-medium"
                : "border-transparent text-[var(--cf-text-muted)] hover:text-[var(--cf-text)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "saved" && <SavedList />}
      {tab === "collections" && <CollectionsPanel />}
      {tab === "history" && <HistoryList />}
    </div>
  );
}

function PaperRow({ title, meta, href, action }: { title: string; meta: string; href: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 border-b border-[var(--cf-border)] last:border-b-0">
      <div className="min-w-0">
        <Link href={href} className="font-medium leading-snug hover:text-[var(--cf-accent-strong)] transition-colors line-clamp-2">
          {title}
        </Link>
        <p className="text-sm text-[var(--cf-text-muted)] mt-0.5 truncate">{meta}</p>
      </div>
      <div className="shrink-0 flex items-center gap-2">{action}</div>
    </div>
  );
}

function ReadBtn({ paperKey }: { paperKey: string }) {
  return (
    <Link
      href={`/paper/${encodeURIComponent(paperKey)}`}
      className="rounded-[8px] border border-[var(--cf-border)] hover:border-[var(--cf-accent)] transition-colors text-xs px-3 py-1.5"
    >
      Read
    </Link>
  );
}

function Loading({ label }: { label: string }) {
  return <p className="text-sm text-[var(--cf-text-muted)] py-8 animate-pulse">Loading {label}…</p>;
}

function ErrorState({ retry }: { retry: () => void }) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm mb-4">We couldn&apos;t load this right now. Please try again.</p>
      <button onClick={retry} className="rounded-[8px] border border-[var(--cf-border)] hover:border-[var(--cf-accent)] transition-colors text-sm px-4 py-2">
        Retry
      </button>
    </div>
  );
}

function EmptySaved() {
  return (
    <div className="py-16 text-center">
      <h2 className="font-medium mb-1.5">Your library is empty.</h2>
      <p className="text-sm text-[var(--cf-text-muted)] mb-6">Save papers while exploring Cogniflux.</p>
      <Link
        href="/explore"
        className="inline-block rounded-[10px] bg-[var(--cf-accent)] hover:bg-[var(--cf-accent-strong)] transition text-white text-sm font-medium px-5 py-2.5"
      >
        Explore papers
      </Link>
    </div>
  );
}

/* ---------------- Saved ---------------- */
function SavedList() {
  const [items, setItems] = useState<SavedItem[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await fetch("/api/library");
      if (!res.ok) throw new Error();
      setItems((await res.json()).items);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function remove(paperKey: string) {
    setBusy(paperKey);
    try {
      await fetch(`/api/library?paperKey=${encodeURIComponent(paperKey)}`, { method: "DELETE" });
      setItems((prev) => prev?.filter((i) => i.paper_key !== paperKey) ?? null);
    } finally {
      setBusy(null);
    }
  }

  if (error) return <ErrorState retry={load} />;
  if (!items) return <Loading label="your saved papers" />;
  if (items.length === 0) return <EmptySaved />;

  return (
    <div>
      {items.map((it) => (
        <PaperRow
          key={it.paper_key}
          title={it.title ?? it.paper_key}
          meta={[it.first_author, it.year].filter(Boolean).join(" · ") || "Unknown source"}
          href={`/paper/${encodeURIComponent(it.paper_key)}`}
          action={
            <>
              <ReadBtn paperKey={it.paper_key} />
              <button
                onClick={() => remove(it.paper_key)}
                disabled={busy === it.paper_key}
                aria-label={`Remove ${it.title ?? "paper"} from library`}
                className="rounded-[8px] border border-transparent hover:border-[var(--cf-border)] transition-colors text-xs px-2.5 py-1.5 text-[var(--cf-text-muted)] disabled:opacity-40"
              >
                Remove
              </button>
            </>
          }
        />
      ))}
    </div>
  );
}

/* ---------------- Collections ---------------- */
function CollectionsPanel() {
  const [items, setItems] = useState<Collection[] | null>(null);
  const [error, setError] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await fetch("/api/collections");
      if (!res.ok) throw new Error();
      setItems((await res.json()).items);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        setName("");
        await load();
      }
    } finally {
      setCreating(false);
    }
  }

  async function rename(id: number) {
    if (!renameValue.trim()) return;
    await fetch(`/api/collections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameValue.trim() }),
    });
    setRenaming(null);
    await load();
  }

  async function remove(id: number) {
    await fetch(`/api/collections/${id}`, { method: "DELETE" });
    setItems((prev) => prev?.filter((c) => c.id !== id) ?? null);
  }

  if (error) return <ErrorState retry={load} />;

  return (
    <div>
      <form onSubmit={create} className="flex gap-2 mb-6 max-w-md">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New collection name…"
          maxLength={100}
          aria-label="New collection name"
          className="flex-1 rounded-[10px] border border-[var(--cf-border)] bg-transparent px-3.5 py-2 text-sm outline-none focus:border-[var(--cf-accent)] transition-colors"
        />
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="rounded-[10px] bg-[var(--cf-accent)] hover:bg-[var(--cf-accent-strong)] transition text-white text-sm font-medium px-4 disabled:opacity-40"
        >
          Create
        </button>
      </form>

      {!items ? (
        <Loading label="your collections" />
      ) : items.length === 0 ? (
        <div className="py-16 text-center">
          <h2 className="font-medium mb-1.5">No collections yet.</h2>
          <p className="text-sm text-[var(--cf-text-muted)]">Group papers by topic or project — like &quot;Thesis reading list&quot;.</p>
        </div>
      ) : (
        items.map((c) =>
          renaming === c.id ? (
            <div key={c.id} className="flex gap-2 py-3.5 border-b border-[var(--cf-border)]">
              <input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                maxLength={100}
                autoFocus
                aria-label="Collection name"
                className="flex-1 rounded-[10px] border border-[var(--cf-border)] bg-transparent px-3 py-1.5 text-sm outline-none focus:border-[var(--cf-accent)]"
              />
              <button onClick={() => rename(c.id)} className="text-sm text-[var(--cf-accent-strong)] hover:underline px-2">
                Save
              </button>
              <button onClick={() => setRenaming(null)} className="text-sm text-[var(--cf-text-muted)] hover:underline px-2">
                Cancel
              </button>
            </div>
          ) : (
            <div key={c.id} className="flex items-center justify-between gap-4 py-3.5 border-b border-[var(--cf-border)] last:border-b-0">
              <div className="min-w-0">
                <p className="font-medium truncate">{c.name}</p>
                <p className="text-sm text-[var(--cf-text-muted)]">
                  {c.paperCount} {c.paperCount === 1 ? "paper" : "papers"}
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <button
                  onClick={() => {
                    setRenaming(c.id);
                    setRenameValue(c.name);
                  }}
                  className="rounded-[8px] border border-transparent hover:border-[var(--cf-border)] transition-colors text-xs px-2.5 py-1.5 text-[var(--cf-text-muted)]"
                >
                  Rename
                </button>
                <button
                  onClick={() => remove(c.id)}
                  className="rounded-[8px] border border-transparent hover:border-red-300 dark:hover:border-red-800 transition-colors text-xs px-2.5 py-1.5 text-[var(--cf-text-muted)] hover:text-red-600 dark:hover:text-red-400"
                >
                  Delete
                </button>
              </div>
            </div>
          )
        )
      )}
    </div>
  );
}

/* ---------------- History ---------------- */
function HistoryList() {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await fetch("/api/history");
      if (!res.ok) throw new Error();
      setItems((await res.json()).items);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <ErrorState retry={load} />;
  if (!items) return <Loading label="your history" />;
  if (items.length === 0)
    return (
      <div className="py-16 text-center">
        <h2 className="font-medium mb-1.5">No reading history yet.</h2>
        <p className="text-sm text-[var(--cf-text-muted)]">Papers you open will appear here. Only visible to you.</p>
      </div>
    );

  return (
    <div>
      {items.map((h) => (
        <PaperRow
          key={h.paperKey}
          title={h.title ?? h.paperKey}
          meta={[h.firstAuthor, h.year].filter(Boolean).join(" · ") || new Date(h.readAt).toLocaleDateString()}
          href={`/paper/${encodeURIComponent(h.paperKey)}`}
          action={<ReadBtn paperKey={h.paperKey} />}
        />
      ))}
    </div>
  );
}
