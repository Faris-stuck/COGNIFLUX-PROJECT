"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * [Read] button for Paper Detail. Active only when a supported full-text
 * representation exists (Europe PMC open access); otherwise shows a disabled
 * state so abstract-only content is never presented as full text.
 */
export function ReadButton({ paperId }: { paperId: string }) {
  const [state, setState] = useState<"loading" | "available" | "unavailable">("loading");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/papers/${encodeURIComponent(paperId)}/fulltext/status`)
      .then((r) => r.json())
      .then((d) => !cancelled && setState(d.available ? "available" : "unavailable"))
      .catch(() => !cancelled && setState("unavailable"));
    return () => {
      cancelled = true;
    };
  }, [paperId]);

  if (state === "loading") {
    return (
      <span className="rounded-[10px] border border-[var(--cf-border)] px-4 py-2 text-sm text-[var(--cf-text-muted)] opacity-60">
        Checking full text…
      </span>
    );
  }
  if (state === "unavailable") {
    return (
      <span
        className="rounded-[10px] border border-[var(--cf-border)] px-4 py-2 text-sm text-[var(--cf-text-muted)] opacity-60"
        title="Full text isn't available in Cogniflux for this paper."
      >
        Full text unavailable
      </span>
    );
  }
  return (
    <Link
      href={`/read/${encodeURIComponent(paperId)}`}
      className="rounded-[10px] bg-[var(--cf-accent-strong)] hover:opacity-90 active:scale-[0.98] transition text-white text-sm font-medium px-4 py-2"
    >
      Read
    </Link>
  );
}
