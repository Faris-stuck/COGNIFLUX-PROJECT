import { SearchBar } from "@/components/search-bar";
import { WorkCard } from "@/components/work-card";
import type { SearchResult } from "@/lib/types";
import { internalFetch } from "@/lib/internal-fetch";
import Link from "next/link";
import type { Metadata } from "next";
import { getServerLocale, getDict } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const t = await getDict(await getServerLocale());
  const q = typeof sp.q === "string" ? sp.q : "";
  return { title: q ? `"${q}" - ${t.search.title}` : t.search.title };
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const t = await getDict(await getServerLocale());
  const q = first(sp.q)?.trim() ?? "";

  if (!q) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-2xl font-semibold tracking-tight mb-4">{t.search.title}</h1>
        <SearchBar size="lg" />
        <p className="text-sm text-[var(--cf-text-muted)] mt-4">{t.search.intro}</p>
      </div>
    );
  }

  const page = Math.max(1, parseInt(first(sp.page) ?? "1", 10) || 1);
  const sort = (first(sp.sort) ?? "relevance") as "relevance" | "newest" | "citations";
  const yearFrom = first(sp.yearFrom) ? parseInt(first(sp.yearFrom)!, 10) : undefined;
  const yearTo = first(sp.yearTo) ? parseInt(first(sp.yearTo)!, 10) : undefined;
  const openAccessOnly = first(sp.openAccessOnly) === "true";

  const params = new URLSearchParams({ q, page: String(page), sort });
  if (yearFrom) params.set("yearFrom", String(yearFrom));
  if (yearTo) params.set("yearTo", String(yearTo));
  if (openAccessOnly) params.set("openAccessOnly", "true");

  let result: SearchResult | null = null;
  let fetchError: string | null = null;
  try {
    // Loopback + forwarded visitor identity: see src/lib/internal-fetch.ts.
    // Going out through the public hostname made every SSR search share one
    // per-IP rate-limit bucket (the server's own address).
    const res = await internalFetch(`/api/search?${params.toString()}`, { cache: "no-store" });
    if (res.ok) {
      result = (await res.json()) as SearchResult;
    } else {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      fetchError = body?.message ?? t.search.genericError;
    }
  } catch {
    fetchError = t.search.genericError;
  }

  const totalPages = result ? Math.min(50, Math.max(1, Math.ceil(result.total / result.perPage))) : 0;
  const pageParams = (p: number) => {
    const np = new URLSearchParams(params);
    np.set("page", String(p));
    return `/search?${np.toString()}`;
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="sr-only">{t.search.title} {t.search.results}</h1>
      <div className="mb-6">
        <SearchBar initialQuery={q} size="md" />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm mb-4">
        {result && <span className="text-[var(--cf-text-muted)]">{t.search.about} {result.total.toLocaleString("id-ID")} {t.search.results}</span>}
        <nav aria-label={t.search.sort} className="flex gap-2">
          {(["relevance", "newest", "citations"] as const).map((s) => {
            const sp2 = new URLSearchParams(params);
            sp2.set("sort", s);
            sp2.set("page", "1");
            return (
              <Link
                key={s}
                href={`/search?${sp2.toString()}`}
                aria-current={sort === s ? "true" : undefined}
                className={sort === s ? "text-[var(--cf-accent-strong)] font-medium" : "text-[var(--cf-text-muted)] hover:text-[var(--cf-text)]"}
              >
                {s === "relevance" ? t.search.relevance : s === "newest" ? t.search.newest : t.search.cited}
              </Link>
            );
          })}
        </nav>
        {result && result.providersFailed.length > 0 && (
          <p role="status" className="text-amber-700 dark:text-amber-400">
            {t.search.providerWarning}{result.providersFailed.join(" and ")}.
          </p>
        )}
      </div>

      {fetchError && (
        <div role="alert" className="rounded-[10px] border border-[var(--cf-border)] bg-[var(--cf-surface)] p-6 text-sm">
          {fetchError}
        </div>
      )}

      {result && result.works.length === 0 && (
        <div className="py-16 text-center">
          <p className="font-medium mb-2">{t.search.noResults}</p>
          <p className="text-sm text-[var(--cf-text-muted)] mb-6">
            {t.search.noResultsHint}
          </p>
          <SearchBar size="md" />
        </div>
      )}

      {result && result.works.length > 0 && (
        <>
          <div role="feed" aria-busy="false">
            {result.works.map((w) => (
              <WorkCard key={w.id} work={w} />
            ))}
          </div>

          {totalPages > 1 && (
            <nav aria-label={t.search.pagination} className="flex items-center justify-between py-8 text-sm">
              {page > 1 ? (
                <Link href={pageParams(page - 1)} className="px-3 py-1.5 rounded-[10px] border border-[var(--cf-border)] hover:border-[var(--cf-accent)] transition-colors">
                  {t.search.previous}
                </Link>
              ) : (
                <span />
              )}
              <span className="text-[var(--cf-text-muted)]">
                {t.search.page} {page} {t.search.of} {totalPages}
              </span>
              {page < totalPages ? (
                <Link href={pageParams(page + 1)} className="px-3 py-1.5 rounded-[10px] border border-[var(--cf-border)] hover:border-[var(--cf-accent)] transition-colors">
                  {t.search.next}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
