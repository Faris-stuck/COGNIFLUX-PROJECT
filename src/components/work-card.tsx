"use client";

import type { Work } from "@/lib/types";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";

export function WorkCard({ work }: { work: Work }) {
  const { t } = useI18n();
  return (
    <article className="py-5 border-b border-[var(--cf-border)] last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--cf-text-muted)] mb-1.5">
        <span>{work.publicationYear ?? "n.d."}</span>
        {work.journal && <span className="truncate max-w-[24rem]">{work.journal}</span>}
        <span className="uppercase tracking-wide">{work.type.replace("-", " ")}</span>
        {work.openAccess.isOa && (
          <span className="rounded-full px-2 py-0.5 bg-[color-mix(in_srgb,var(--cf-accent)_12%,transparent)] text-[var(--cf-accent-strong)] font-medium">
            {work.openAccess.isOa ? t.paper.pdf : ""}
          </span>
        )}
        {work.citationCount != null && work.citationCount > 0 && <span>{work.citationCount.toLocaleString("id-ID")} citations</span>}
        {work.sources.length > 1 && <span title={`Also on: ${work.sources.join(", ")}`}>{work.sources.length} sources</span>}
      </div>

      <h2 className="text-base font-medium leading-snug mb-1">
        <Link href={`/paper/${encodeURIComponent(work.id)}`} className="hover:text-[var(--cf-accent-strong)] transition-colors">
          {work.title}
        </Link>
      </h2>

      {work.authors.length > 0 && (
        <p className="text-sm text-[var(--cf-text-muted)] mb-2">
          {work.authors.slice(0, 4).map((a) => a.name).join(", ")}
          {work.authors.length > 4 ? ` et al.` : ""}
        </p>
      )}

      {work.abstract && <p className="text-sm text-[var(--cf-text-muted)] leading-relaxed line-clamp-2 max-w-[70ch]">{work.abstract}</p>}
    </article>
  );
}
