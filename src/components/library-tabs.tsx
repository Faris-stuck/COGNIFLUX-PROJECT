"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";

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

const TABS = ["saved", "collections", "history"] as const;

export function LibraryTabs() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("saved");
  return (
    <div>
      <nav role="tablist" aria-label={t.library.title} className="flex gap-1 border-b border-[var(--cf-border)] mb-6">
        {TABS.map((key) => (
          <button
            type="button"
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
              tab === key
                ? "border-[var(--cf-accent)] text-[var(--cf-text)] font-medium"
                : "border-transparent text-[var(--cf-text-muted)] hover:text-[var(--cf-text)]"
            }`}
          >
            {key === "saved" ? t.library.saved : key === "collections" ? t.library.collections : t.library.history}
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
  const { t } = useI18n();
  return (
    <Link
      href={`/paper/${encodeURIComponent(paperKey)}`}
      className="rounded-[8px] border border-[var(--cf-border)] hover:border-[var(--cf-accent)] transition-colors text-xs px-3 py-1.5"
    >
      {t.library.read}
    </Link>
  );
}

function Loading({ label }: { label: string }) {
  const { t } = useI18n();
  return <p className="text-sm text-[var(--cf-text-muted)] py-8 animate-pulse">{t.common.loading} {label}…</p>;
}

function ErrorState({ retry }: { retry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="py-10 text-center">
      <p className="text-sm mb-4">{t.common.retry}</p>
      <button type="button" onClick={retry} className="rounded-[8px] border border-[var(--cf-border)] hover:border-[var(--cf-accent)] transition-colors text-sm px-4 py-2">
        {t.common.retry}
      </button>
    </div>
  );
}

function EmptySaved() {
  const { t } = useI18n();
  return (
    <div className="py-16 text-center">
      <h2 className="font-medium mb-1.5">{t.library.emptySaved}</h2>
      <p className="text-sm text-[var(--cf-text-muted)] mb-6">{t.library.saveWhile}</p>
      <Link
        href="/explore"
        className="inline-block rounded-[10px] bg-[var(--cf-accent)] hover:bg-[var(--cf-accent-strong)] transition text-white text-sm font-medium px-5 py-2.5"
      >
        {t.library.explore}
      </Link>
    </div>
  );
}

/* ---------------- Saved ---------------- */
function SavedList() {
  const { t } = useI18n();
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
      const res = await fetch(`/api/library?paperKey=${encodeURIComponent(paperKey)}`, { method: "DELETE" });
      if (!res.ok) {
        setError(true);
        return;
      }
      setItems((prev) => prev?.filter((i) => i.paper_key !== paperKey) ?? null);
    } finally {
      setBusy(null);
    }
  }

  if (error) return <ErrorState retry={load} />;
  if (!items) return <Loading label={t.library.saved.toLowerCase()} />;
  if (items.length === 0) return <EmptySaved />;

  return (
    <div>
      {items.map((it) => (
        <PaperRow
          key={it.paper_key}
          title={it.title ?? it.paper_key}
          meta={[it.first_author, it.year].filter(Boolean).join(" · ") || t.library.unknownSource}
          href={`/paper/${encodeURIComponent(it.paper_key)}`}
          action={
            <>
              <ReadBtn paperKey={it.paper_key} />
              <button
                type="button"
                onClick={() => remove(it.paper_key)}
                disabled={busy === it.paper_key}
                aria-label={`${t.library.remove}: ${it.title ?? "paper"}`}
                className="rounded-[8px] border border-transparent hover:border-[var(--cf-border)] transition-colors text-xs px-2.5 py-1.5 text-[var(--cf-text-muted)] disabled:opacity-40"
              >
                {t.library.remove}
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
  const { t } = useI18n();
  const [items, setItems] = useState<Collection[] | null>(null);
  const [error, setError] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [actionBusy, setActionBusy] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
    setActionError(null);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        setName("");
        await load();
      } else {
        const data = await res.json().catch(() => null);
        setActionError(data?.message ?? "Could not create the collection.");
      }
    } finally {
      setCreating(false);
    }
  }

  async function rename(id: number) {
    if (!renameValue.trim()) return;
    setActionBusy(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/collections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setActionError(data?.message ?? "Could not rename the collection.");
        return;
      }
      setRenaming(null);
      await load();
    } finally {
      setActionBusy(null);
    }
  }

  async function remove(id: number) {
    setActionBusy(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/collections/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setActionError(data?.message ?? "Could not delete the collection.");
        return;
      }
      setItems((prev) => prev?.filter((c) => c.id !== id) ?? null);
    } finally {
      setActionBusy(null);
    }
  }

  if (error) return <ErrorState retry={load} />;

  return (
    <div>
      {actionError && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">{actionError}</p>}
      <form onSubmit={create} className="flex gap-2 mb-6 max-w-md">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.library.newCollection}
          maxLength={100}
          aria-label={t.library.newCollection}
          className="flex-1 rounded-[10px] border border-[var(--cf-border)] bg-transparent px-3.5 py-2 text-sm outline-none focus:border-[var(--cf-accent)] transition-colors"
        />
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="rounded-[10px] bg-[var(--cf-accent)] hover:bg-[var(--cf-accent-strong)] transition text-white text-sm font-medium px-4 disabled:opacity-40"
        >
          {t.common.create}
        </button>
      </form>

      {!items ? (
        <Loading label={t.library.collections.toLowerCase()} />
      ) : items.length === 0 ? (
        <div className="py-16 text-center">
          <h2 className="font-medium mb-1.5">{t.library.noCollections}</h2>
          <p className="text-sm text-[var(--cf-text-muted)]">{t.library.collectionExample}</p>
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
                aria-label={t.library.collectionName}
                className="flex-1 rounded-[10px] border border-[var(--cf-border)] bg-transparent px-3 py-1.5 text-sm outline-none focus:border-[var(--cf-accent)]"
              />
              <button type="button" onClick={() => rename(c.id)} disabled={actionBusy === c.id} className="text-sm text-[var(--cf-accent-strong)] hover:underline px-2 disabled:opacity-50">
                {actionBusy === c.id ? t.common.loading : t.common.save}
              </button>
              <button type="button" onClick={() => setRenaming(null)} className="text-sm text-[var(--cf-text-muted)] hover:underline px-2">
                {t.common.cancel}
              </button>
            </div>
          ) : (
            <div key={c.id} className="flex items-center justify-between gap-4 py-3.5 border-b border-[var(--cf-border)] last:border-b-0">
              <div className="min-w-0">
                <p className="font-medium truncate">{c.name}</p>
                <p className="text-sm text-[var(--cf-text-muted)]">
                  {c.paperCount} {c.paperCount === 1 ? t.library.papersOne : t.library.papersMany}
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRenaming(c.id);
                    setRenameValue(c.name);
                  }}
                  className="rounded-[8px] border border-transparent hover:border-[var(--cf-border)] transition-colors text-xs px-2.5 py-1.5 text-[var(--cf-text-muted)]"
                >
                  {t.common.rename}
                </button>
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  disabled={actionBusy === c.id}
                  className="rounded-[8px] border border-transparent hover:border-red-300 dark:hover:border-red-800 transition-colors text-xs px-2.5 py-1.5 text-[var(--cf-text-muted)] hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
                >
                  {actionBusy === c.id ? "…" : t.common.delete}
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
  const { t } = useI18n();
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
  if (!items) return <Loading label={t.library.history.toLowerCase()} />;
  if (items.length === 0)
    return (
      <div className="py-16 text-center">
        <h2 className="font-medium mb-1.5">{t.library.noHistory}</h2>
        <p className="text-sm text-[var(--cf-text-muted)]">{t.library.historyHint}</p>
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
