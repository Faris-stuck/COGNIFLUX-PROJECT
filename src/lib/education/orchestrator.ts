import type { EducationResource, EducationSearchParams, EducationSearchResult } from "./types";
import { cached } from "../db";

/**
 * Education orchestrator: cache -> parallel providers -> normalize -> dedup ->
 * rank -> paginate. Mirrors the academic ProviderOrchestrator conventions:
 * a failing provider never fails the whole search.
 */

function hashKey(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url").slice(0, 80);
}

export function educationCacheKey(params: EducationSearchParams): string {
  return `cf:edu-search:v1:${hashKey({
    q: params.q.toLowerCase().trim(),
    p: params.page,
    pp: params.perPage,
    lv: [...params.level].sort(),
    g: params.grade ?? null,
    su: [...params.subject].sort(),
    la: [...params.language].sort(),
    rt: [...params.resourceType].sort(),
    yf: params.yearFrom ?? null,
    yt: params.yearTo ?? null,
  })}`;
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

/**
 * Identity priority: ISBN13 > DOI > source URL > normalized title (+year).
 * Duplicates merge into one canonical resource with multiple `sources`.
 */
export function dedupeEducationResources(resources: EducationResource[]): EducationResource[] {
  const out: EducationResource[] = [];
  const byIsbn = new Map<string, EducationResource>();
  const byUrl = new Map<string, EducationResource>();
  const byTitle = new Map<string, EducationResource>();

  for (const r of resources) {
    const isbn = (r.metadata.isbn13 as string | undefined)?.replace(/-/g, "") ?? null;
    if (isbn && byIsbn.has(isbn)) {
      mergeInto(byIsbn.get(isbn)!, r);
      continue;
    }
    const urlKey = canonicalUrl(r);
    if (urlKey && byUrl.has(urlKey)) {
      mergeInto(byUrl.get(urlKey)!, r);
      continue;
    }
    const tKey = `${titleKey(r.title)}|${r.year ?? ""}`;
    if (tKey.length > 8 && byTitle.has(tKey)) {
      mergeInto(byTitle.get(tKey)!, r);
      continue;
    }
    const stored = { ...r };
    out.push(stored);
    if (isbn) byIsbn.set(isbn, stored);
    if (urlKey) byUrl.set(urlKey, stored);
    if (tKey.length > 8) byTitle.set(tKey, stored);
  }
  return out;
}

/** Normalized external URL key; null when the resource has no public URL. */
function canonicalUrl(r: EducationResource): string | null {
  const raw = r.readUrl ?? r.sourceUrl;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    u.hash = "";
    u.search = "";
    let s = u.toString().toLowerCase();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s;
  } catch {
    return null;
  }
}

function mergeInto(a: EducationResource, b: EducationResource): void {
  a.sources = [...new Set([...a.sources, ...b.sources])];
  if (!a.description && b.description) a.description = b.description;
  if (!a.readUrl && b.readUrl) a.readUrl = b.readUrl;
  if (!a.thumbnail && b.thumbnail) a.thumbnail = b.thumbnail;
  if (!a.license && b.license) a.license = b.license;
  if (a.authors.length === 0 && b.authors.length > 0) a.authors = b.authors;
  for (const l of b.educationLevel) if (!a.educationLevel.includes(l)) a.educationLevel.push(l);
  for (const s of b.subject) if (!a.subject.includes(s)) a.subject.push(s);
  for (const f of b.format) if (!a.format.includes(f)) a.format.push(f);
}

// ---------- Ranking ----------

export function rankEducationResources(resources: EducationResource[], params: EducationSearchParams): EducationResource[] {
  const terms = params.q
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter((t) => t.length > 2);

  const scored = resources.map((r) => {
    const title = r.title.toLowerCase();
    const hay = `${title} ${r.description ?? ""} ${r.topic ?? ""}`.toLowerCase();
    let coverage = 0;
    for (const t of terms) if (hay.includes(t)) coverage++;
    const covScore = terms.length ? coverage / terms.length : 0.5;

    const titleHit = terms.filter((t) => title.includes(t)).length / Math.max(1, terms.length);

    // Level match: explicit filter or query-implied level gets strong priority.
    const levelMatch =
      params.level.length === 0 ? 0 : r.educationLevel.some((l) => params.level.includes(l)) ? 1 : 0;

    // Exact grade match has significant priority per spec.
    const gradeMatch =
      params.grade == null ? 0 : r.grade === params.grade ? 1 : r.grade != null ? 0.2 : 0;

    const subjectMatch =
      params.subject.length === 0 ? 0 : r.subject.some((s) => params.subject.includes(s)) ? 1 : 0;

    const langMatch =
      params.language.length === 0 ? 0 : params.language.includes(r.language) ? 1 : 0;

    const age = r.year ? Math.max(0, new Date().getFullYear() - r.year) : 15;
    const recency = Math.max(0, 1 - age / 20);

    // Source quality prior v1: curated university/nonprofit catalogs.
    const sourceQuality = r.source === "openstax" ? 0.9 : r.source === "otl" ? 0.8 : 0.5;

    const score =
      covScore * 0.3 +
      titleHit * 0.2 +
      levelMatch * 0.18 +
      gradeMatch * 0.12 +
      subjectMatch * 0.08 +
      langMatch * 0.05 +
      recency * 0.04 +
      sourceQuality * 0.03;

    return { r, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.r);
}

// ---------- Orchestrator ----------

interface EduProviderAttempt {
  id: string;
  result?: EducationSearchResult;
  error?: string;
  latencyMs: number;
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class EducationOrchestrator {
  private providers: { provider: import("./provider-types").EducationProvider; hardTimeoutMs: number }[];

  constructor(providers?: import("./provider-types").EducationProvider[]) {
    const list =
      providers ??
      (() => {
        // Lazy requires keep unit tests free of network imports.
        const { OpenStaxProvider } = require("./openstax") as typeof import("./openstax");
        const { OpenTextbookLibraryProvider } = require("./otl") as typeof import("./otl");
        return [new OpenStaxProvider(), new OpenTextbookLibraryProvider()] as import("./provider-types").EducationProvider[];
      })();
    this.providers = list.map((provider) => ({ provider, hardTimeoutMs: provider.timeoutMs + 8000 }));
  }

  async search(params: EducationSearchParams): Promise<EducationSearchResult & { degraded: boolean }> {
    return cached(educationCacheKey(params), 1800, async () => {
      const settled = await Promise.allSettled(
        this.providers.map(async ({ provider, hardTimeoutMs }): Promise<EduProviderAttempt> => {
          const t0 = Date.now();
          try {
            const result = await withTimeout(provider.search(params), hardTimeoutMs, provider.id);
            return { id: provider.id, result, latencyMs: Date.now() - t0 };
          } catch (e) {
            return { id: provider.id, error: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t0 };
          }
        })
      );

      const attempts: EduProviderAttempt[] = settled.map((s) =>
        s.status === "fulfilled"
          ? s.value
          : ({ id: "unknown", error: String(s.reason), latencyMs: 0 } as EduProviderAttempt)
      );

      const ok = attempts.filter((a) => a.result);
      const failed = attempts.filter((a) => a.error).map((a) => a.id);

      const all = ok.flatMap((a) => a.result!.resources);
      const deduped = dedupeEducationResources(all);
      const ranked = rankEducationResources(deduped, params);

      const total = ok.reduce((max, a) => Math.max(max, a.result!.total), 0);
      const start = (params.page - 1) * params.perPage;

      return {
        resources: ranked.slice(start, start + params.perPage),
        total: total || ranked.length,
        page: params.page,
        perPage: params.perPage,
        providersUsed: [...new Set(ok.flatMap((a) => a.result!.providersUsed))],
        providersFailed: failed,
        degraded: failed.length > 0 && ok.length > 0,
      };
    });
  }

  /** Fetch one resource across all capable providers (first hit wins). */
  async getResource(eduId: string): Promise<EducationResource | null> {
    const m = eduId.match(/^edu:([a-z0-9-]+):(.+)$/);
    if (!m) return null;
    const [, providerId, sourceId] = m;
    const entry = this.providers.find(({ provider }) => provider.id === providerId);
    if (!entry || !entry.provider.capabilities.getResource) return null;
    try {
      return await withTimeout(entry.provider.getResource(sourceId), entry.hardTimeoutMs, providerId);
    } catch {
      return null;
    }
  }

  listProviders(): Array<{ id: string; name: string; homepageUrl: string; capabilities: import("./provider-types").EducationProviderCapabilities; pending?: string }> {
    return this.providers.map(({ provider }) => ({
      id: provider.id,
      name: provider.name,
      homepageUrl: provider.homepageUrl,
      capabilities: provider.capabilities,
      pending: provider instanceof (require("./pending") as typeof import("./pending")).PendingEducationProvider ? provider.pendingReason : undefined,
    }));
  }
}
