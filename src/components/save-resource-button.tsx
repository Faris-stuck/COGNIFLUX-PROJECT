"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";

interface Props {
  resourceId: string;
  title: string;
  authors: { name: string }[];
  year: number | null;
  publisher: string | null;
  readUrl: string | null;
}

export function SaveResourceButton({ resourceId, title, authors, year, publisher, readUrl }: Props) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "auth" | "error">("idle");
  const { t } = useI18n();

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
      else setState("error");
    } catch {
      setState("error");
    }
  }

  if (state === "auth") {
    return (
      <a
        href="/login?mode=login"
        className="inline-flex items-center rounded-[10px] border border-[var(--cf-border)] hover:border-[var(--cf-accent)] transition-colors px-4 py-2.5 text-sm font-medium"
      >
        {t.common.signInToSave}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={save}
      disabled={state === "busy" || state === "done"}
      className="rounded-[10px] border border-[var(--cf-border)] hover:border-[var(--cf-accent)] transition-colors px-4 py-2.5 text-sm font-medium disabled:opacity-60"
    >
      {state === "done" ? t.common.saved : state === "busy" ? "…" : state === "error" ? t.common.retry : t.common.save}
    </button>
  );
}
