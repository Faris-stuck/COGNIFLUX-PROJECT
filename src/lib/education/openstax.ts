import type { EducationResource, EducationSearchParams, EducationSearchResult, EducationLevel } from "./types";
import { EducationResourceSchema } from "./types";
import type { EducationProvider } from "./provider-types";

/**
 * OpenStax provider.
 *
 * Official public mechanism (inspected 2026-08): Wagtail CMS JSON API at
 * https://openstax.org/apps/cms/api/v2/pages/?type=books.Book
 * - full catalog in one request with fields=... (~1.1 MB for 129 books)
 * - per-book detail: /apps/cms/api/v2/pages/<id>/
 * No API key required. There is no server-side search endpoint; we fetch the
 * catalog (cached in Redis) and filter client-side. This is the provider's
 * own supported data format - nothing invented.
 */

const CATALOG_URL =
  "https://openstax.org/apps/cms/api/v2/pages/?type=books.Book&fields=title,slug,book_subjects,k12book_subjects,description,authors,pdf_url,license_name,publish_date,cover_url,is_ap&limit=200";
const CATALOG_TTL = 6 * 3600; // catalog changes rarely

interface OsAuthor {
  type?: string;
  value?: { name?: string; senior_author?: boolean };
}
interface OsSubject {
  subject_name?: string;
}
interface OsBook {
  id: number;
  meta?: {
    slug?: string;
    html_url?: string;
    first_published_at?: string;
    locale?: string;
  };
  title?: string;
  book_subjects?: OsSubject[] | null;
  k12book_subjects?: OsSubject[] | null;
  description?: string | null;
  authors?: OsAuthor[] | null;
  pdf_url?: string | null;
  license_name?: string | null;
  publish_date?: string | null;
  cover_url?: string | null;
  is_ap?: boolean;
}

function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000) || null;
}

/** Map OpenStax subject names to canonical slugs + infer education levels. */
const SUBJECT_MAP: Record<string, { subject: string; levels: EducationLevel[] }> = {
  math: { subject: "mathematics", levels: ["university"] },
  matemáticas: { subject: "mathematics", levels: ["high-school", "university"] },
  science: { subject: "biology", levels: ["high-school", "university"] },
  physics: { subject: "physics", levels: ["high-school", "university"] },
  chemistry: { subject: "chemistry", levels: ["high-school", "university"] },
  biology: { subject: "biology", levels: ["high-school", "university"] },
  astronomy: { subject: "physics", levels: ["university"] },
  calculus: { subject: "mathematics", levels: ["university"] },
  algebra: { subject: "mathematics", levels: ["high-school"] },
  "computer science": { subject: "computer-science", levels: ["high-school", "university"] },
  "information technology": { subject: "information-technology", levels: ["vocational", "high-school"] },
  economics: { subject: "economics", levels: ["university", "high-school"] },
  business: { subject: "business", levels: ["university", "vocational"] },
  accounting: { subject: "accounting", levels: ["university"] },
  history: { subject: "history", levels: ["high-school", "university"] },
  "american government": { subject: "history", levels: ["high-school"] },
  psychology: { subject: "health", levels: ["university"] },
  "anatomy & physiology": { subject: "health", levels: ["university", "vocational"] },
  "health science": { subject: "health", levels: ["high-school", "vocational"] },
  nursing: { subject: "health", levels: ["university", "professional"] },
  "college success": { subject: "professional", levels: ["university"] },
};

export function normalizeOpenStax(b: OsBook): EducationResource {
  // Some CMS entries carry relative/invalid cover URLs - never let one bad
  // field fail the whole resource.
  const safeUrl = (u: string | null | undefined): string | null => {
    if (!u) return null;
    try {
      return new URL(u, "https://openstax.org").toString();
    } catch {
      return null;
    }
  };

  const subjectsRaw = [...(b.book_subjects ?? []), ...(b.k12book_subjects ?? [])];
  const isK12 = (b.k12book_subjects ?? []).length > 0;
  const subjects: string[] = [];
  const levels = new Set<EducationLevel>();
  for (const s of subjectsRaw) {
    const name = s.subject_name?.toLowerCase().trim();
    if (!name) continue;
    const mapped = SUBJECT_MAP[name];
    if (mapped) {
      if (!subjects.includes(mapped.subject)) subjects.push(mapped.subject);
      mapped.levels.forEach((l) => levels.add(l));
      // k12 subject list implies high-school floor
      if (isK12 && !levels.has("middle-school")) levels.add("middle-school");
    } else if (!subjects.includes(name)) {
      subjects.push(name); // preserve verbatim unknowns
    }
  }
  const year = b.publish_date ? Number(b.publish_date.slice(0, 4)) || null : null;

  return EducationResourceSchema.parse({
    id: `edu:openstax:${b.id}`,
    title: (b.title ?? "").trim(),
    description: stripHtml(b.description),
    authors: (b.authors ?? [])
      .filter((a) => a.type === "author" && a.value?.name)
      .slice(0, 20)
      .map((a) => ({ name: a.value!.name! })),
    publisher: "OpenStax",
    year,
    language: b.meta?.locale === "pl" ? "pl" : "en", // OpenStax has es/pl site variants; API locale is authoritative where present
    educationLevel: [...levels],
    grade: null,
    subject: subjects,
    topic: null,
    resourceType: "textbook",
    format: [b.pdf_url ? "pdf" : null, "web"].filter(Boolean) as string[],
    source: "openstax",
    sourceId: String(b.id),
    sourceUrl: safeUrl(b.meta?.html_url) ?? `https://openstax.org/details/books/${b.meta?.slug ?? ""}`,
    readUrl: safeUrl(b.pdf_url) ?? safeUrl(b.meta?.html_url),
    license: b.license_name ?? "Creative Commons Attribution",
    updatedAt: b.meta?.first_published_at ?? null,
    thumbnail: safeUrl(b.cover_url),
    metadata: { isAp: b.is_ap ?? false, slug: b.meta?.slug ?? null },
    sources: ["openstax"],
  });
}

async function fetchCatalog(): Promise<OsBook[]> {
  // Catalog (~1.1 MB) is Redis-cached: cold starts and server restarts must
  // not re-download it. cached() degrades gracefully if Redis is down.
  const { cached } = await import("../db");
  return cached<{ items: OsBook[] }>("cf:edu-catalog:v1:openstax", CATALOG_TTL, async () => {
    const res = await fetch(CATALOG_URL, {
      headers: { accept: "application/json", "user-agent": "Cogniflux/0.1 (education discovery)" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`openstax catalog HTTP ${res.status}`);
    return (await res.json()) as { items: OsBook[] };
  }).then((d) => d.items ?? []);
}

// Simple in-process memo on top of the Redis cache.
let catalogMemo: { at: number; books: OsBook[] } | null = null;

export async function getOpenStaxCatalog(): Promise<OsBook[]> {
  if (catalogMemo && Date.now() - catalogMemo.at < 10 * 60_000) return catalogMemo.books;
  const books = await fetchCatalog();
  catalogMemo = { at: Date.now(), books };
  return books;
}

/** Local text filter over the cached catalog (provider has no search endpoint). */
function matchesQuery(book: EducationResource, terms: string[]): boolean {
  const hay = `${book.title} ${book.description ?? ""} ${book.subject.join(" ")}`.toLowerCase();
  if (terms.length === 0) return true;
  return terms.some((t) => hay.includes(t));
}

function matchesFilters(r: EducationResource, p: EducationSearchParams): boolean {
  if (p.level.length && !p.level.some((l) => r.educationLevel.includes(l))) return false;
  if (p.subject.length && !p.subject.some((s) => r.subject.includes(s))) return false;
  if (p.resourceType.length && !p.resourceType.includes(r.resourceType)) return false;
  if (p.language.length && !p.language.includes(r.language)) return false;
  return true;
}

export class OpenStaxProvider implements EducationProvider {
  readonly id = "openstax";
  readonly name = "OpenStax";
  readonly homepageUrl = "https://openstax.org";
  // Catalog-based provider: first (cold) call downloads ~1.1 MB; subsequent
  // calls are Redis/in-process cache hits. Timeout covers the cold case.
  readonly timeoutMs = 25_000;
  readonly capabilities = {
    search: true,
    getResource: true,
    catalogFeed: true,
    getSubjects: true,
    getLevels: true,
    getLanguages: true,
    getFormats: true,
    license: true,
    updatedAt: true,
    sourceUrl: true,
  };

  async search(params: EducationSearchParams): Promise<EducationSearchResult> {
    const books = await getOpenStaxCatalog();
    const terms = params.q.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    let resources = books.map(normalizeOpenStax).filter((r) => matchesQuery(r, terms) && matchesFilters(r, params));
    resources = rankLocal(resources, terms);
    const total = resources.length;
    const start = (params.page - 1) * params.perPage;
    return {
      resources: resources.slice(start, start + params.perPage),
      total,
      page: params.page,
      perPage: params.perPage,
      providersUsed: ["openstax"],
      providersFailed: [],
      degraded: false,
    };
  }

  async getResource(sourceId: string): Promise<EducationResource | null> {
    const books = await getOpenStaxCatalog();
    const book = books.find((b) => String(b.id) === sourceId);
    return book ? normalizeOpenStax(book) : null;
  }
}

/** Small local ranking: term coverage then title hits. */
export function rankLocal(resources: EducationResource[], terms: string[]): EducationResource[] {
  const scored = resources.map((r) => {
    const title = r.title.toLowerCase();
    const hay = `${title} ${r.description ?? ""}`.toLowerCase();
    let coverage = 0;
    for (const t of terms) if (hay.includes(t)) coverage++;
    const covScore = terms.length ? coverage / terms.length : 0;
    const titleHits = terms.filter((t) => title.includes(t)).length;
    return { r, score: covScore + titleHits * 0.3 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.r);
}
