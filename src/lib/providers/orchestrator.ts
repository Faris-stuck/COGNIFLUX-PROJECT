import type { SearchParams, SearchResult, Work } from "../types";
import { cached } from "../db";
import { OpenAlexProvider } from "./openalex";
import { CrossrefProvider } from "./crossref";
import type { AcademicProvider } from "./types";

/**
 * Provider Orchestrator:
 * cache check -> parallel provider requests -> normalize -> dedup -> rank -> merge -> response.
 * A failing provider never fails the whole search.
 */

interface ProviderAttempt {
  id: string;
  result?: SearchResult;
  error?: string;
  latencyMs: number;
}

function hashKey(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url").slice(0, 80);
}

export function searchCacheKey(params: SearchParams): string {
  return `cf:search:v1:${hashKey({ q: params.q.toLowerCase().trim(), p: params.page, pp: params.perPage, yf: params.yearFrom ?? null, yt: params.yearTo ?? null, oa: params.openAccessOnly, s: params.sort })}`;
}

// ---------- Deduplication ----------

function titleKey(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Priority identity: DOI > normalized title+year fuzzy. Returns merged list. */
export function dedupeWorks(works: Work[]): Work[] {
  const byDoi = new Map<string, Work>();
  const byTitle = new Map<string, Work>();
  const out: Work[] = [];

  for (const w of works) {
    if (!w.title) continue;
    const doi = w.doi?.toLowerCase() ?? null;
    if (doi) {
      const existing = byDoi.get(doi);
      if (existing) {
        mergeInto(existing, w);
        continue;
      }
    }
    const tKey = `${titleKey(w.title)}|${w.publicationYear ?? ""}`;
    const existingTitle = byTitle.get(tKey);
    if (existingTitle) {
      // same title+year but different/missing DOI: prefer keeping DOI variant as canonical
      if (doi && !existingTitle.doi) {
        mergeInto(existingTitle, { ...w });
        // replace entry with DOI-carrying version
        byDoi.set(doi, existingTitle);
      } else {
        mergeInto(existingTitle, w);
      }
      continue;
    }
    const stored = { ...w };
    out.push(stored);
    if (doi) byDoi.set(doi, stored);
    byTitle.set(tKey, stored);
  }
  return out;
}

/** Merge richer fields from `b` into `a` (a is canonical). */
function mergeInto(a: Work, b: Work): void {
  if (!b.sources.every((s) => a.sources.includes(s))) a.sources = [...new Set([...a.sources, ...b.sources])];
  if (!a.abstract && b.abstract) a.abstract = b.abstract;
  if ((a.citationCount == null || a.citationCount === 0) && b.citationCount != null) a.citationCount = b.citationCount;
  if (!a.journal && b.journal) a.journal = b.journal;
  if (!a.publisher && b.publisher) a.publisher = b.publisher;
  if (!a.openAccess.isOa && b.openAccess.isOa) {
    a.openAccess = b.openAccess;
    if (!a.fullTextUrl) a.fullTextUrl = b.fullTextUrl;
  }
  if (!a.fullTextUrl && b.fullTextUrl) a.fullTextUrl = b.fullTextUrl;
  if (!a.publicationYear && b.publicationYear) a.publicationYear = b.publicationYear;
  if (a.subjects.length === 0 && b.subjects.length > 0) a.subjects = b.subjects;
}

// ---------- Ranking ----------

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Composite score. Citation count alone buries recent papers; recency and
 * query-term coverage keep them visible. Weights are heuristic v1.
 */
export function rankWorks(works: Work[], query: string): Work[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  const scored = works.map((w) => {
    const hay = `${w.title} ${w.abstract ?? ""}`.toLowerCase();
    let termHits = 0;
    for (const t of terms) if (hay.includes(t)) termHits++;
    const coverage = terms.length ? termHits / terms.length : 0.5;

    const titleHit = terms.some((t) => w.title.toLowerCase().includes(t)) ? 0.2 : 0;
    const citeScore =
      w.citationCount == null ? 0 : Math.min(1, Math.log10(w.citationCount + 1) / 4); // ~10k citations -> 1.0
    const age = w.publicationYear ? Math.max(0, CURRENT_YEAR - w.publicationYear) : 20;
    const recency = Math.max(0, 1 - age / 15); // full credit <= current year, decays over 15y

    const score = coverage * 0.45 + titleHit + citeScore * 0.2 + recency * 0.15;
    return { w, score };
  });
  scored.sort((x, y) => y.score - x.score);
  return scored.map((s) => s.w);
}

// ---------- Orchestrator ----------

export class ProviderOrchestrator {
  private providers: AcademicProvider[];

  constructor(providers?: AcademicProvider[]) {
    this.providers = providers ?? [new OpenAlexProvider(), new CrossrefProvider()];
  }

  async search(params: SearchParams): Promise<SearchResult & { degraded: boolean }> {
    return cached(searchCacheKey(params), 900, async () => {
      const settled = await Promise.allSettled(
        this.providers.map(async (p): Promise<ProviderAttempt> => {
          const t0 = Date.now();
          try {
            const result = await withTimeout(p.search(params), p.timeoutMs + 4000, p.id);
            return { id: p.id, result, latencyMs: Date.now() - t0 };
          } catch (e) {
            return { id: p.id, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t0 };
          }
        })
      );

      const attempts = settled.map((s) =>
        s.status === "fulfilled" ? s.value : ({ id: "unknown", error: String(s.reason), latencyMs: 0 } as ProviderAttempt)
      );

      const ok = attempts.filter((a) => a.result);
      const failed = attempts.filter((a) => a.error).map((a) => a.id);

      const allWorks = ok.flatMap((a) => a.result!.works);
      const deduped = dedupeWorks(allWorks);
      const ranked = params.sort === "relevance" ? rankWorks(deduped, params.q) : sortExplicit(deduped, params.sort);

      const total = ok.reduce((max, a) => Math.max(max, a.result!.total), 0);
      // paginate merged list canonically
      const start = (params.page - 1) * params.perPage;
      const pageWorks = ranked.slice(start, start + params.perPage);

      return {
        works: pageWorks,
        total: total || ranked.length,
        page: params.page,
        perPage: params.perPage,
        providersUsed: [...new Set(ok.flatMap((a) => a.result!.providersUsed))],
        providersFailed: failed,
        degraded: failed.length > 0 && ok.length > 0,
      };
    });
  }

  async getWork(id: string): Promise<Work | null> {
    for (const p of this.providers) {
      if (!p.capabilities.getWork) continue;
      try {
        const work = await withTimeout(p.getWork(id), p.timeoutMs + 4000, p.id);
        if (work) return work;
      } catch {
        /* try next provider */
      }
    }
    return null;
  }

  listProviders(): Array<{ id: string; capabilities: AcademicProvider["capabilities"] }> {
    return this.providers.map((p) => ({ id: p.id, capabilities: p.capabilities }));
  }
}

function sortExplicit(works: Work[], sort: "newest" | "citations"): Work[] {
  const copy = [...works];
  if (sort === "newest") copy.sort((a, b) => (b.publicationYear ?? 0) - (a.publicationYear ?? 0));
  else copy.sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0));
  return copy;
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

// Singleton for API routes
declare global {
  // eslint-disable-next-line no-var
  var _cfOrchestrator: ProviderOrchestrator | undefined;
}
export function getOrchestrator(): ProviderOrchestrator {
  if (!global._cfOrchestrator) global._cfOrchestrator = new ProviderOrchestrator();
  return global._cfOrchestrator;
}
