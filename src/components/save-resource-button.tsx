"use client";

import { useState } from "react";

interface Props {
  resourceId: string;
  title: string;
  authors: { name: string }[];
  year: number | null;
  publisher: string | null;
  readUrl: string | null;
}

export function SaveResourceButton({ resourceId, title, authors, year, publisher, readUrl }: Props) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "auth">("idle");

  async function save() {
    setState("busy");
    try {
      const res = await fetch("/api/library", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          paperKey: resourceId,
          work: {
            title,
            authors: authors.slice(0, 10),
            publicationYear: year,
            journal: publisher,
            doi: null,
            openAccess: { isOa: true, url: readUrl },
          },
        }),
      });
      if (res.status === 401) setState("auth");
      else if (res.ok) setState("done");
      else setState("idle");
    } catch {
      setState("idle");
    }
  }

  return (
    <button
      onClick={save}
      disabled={state === "busy" || state === "done"}
      className="rounded-[10px] border border-[var(--cf-border)] hover:border-[var(--cf-accent)] transition-colors px-4 py-2.5 text-sm font-medium disabled:opacity-60"
    >
      {state === "auth" ? (
        <a href="/login?mode=login">Sign in to save</a>
      ) : state === "done" ? (
        "Saved ✓ (in your Library)"
      ) : state === "busy" ? (
        "Saving…"
      ) : (
        "Save"
      )}
    </button>
  );
}
