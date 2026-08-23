import type { EducationResource, EducationSearchParams, EducationSearchResult, EducationLevel } from "./types";
import { EducationResourceSchema } from "./types";
import type { EducationProvider } from "./provider-types";

/**
 * Open Textbook Library (University of Minnesota) provider.
 *
 * Official public mechanism (inspected 2026-08):
 * - Full catalog feed: https://open.umn.edu/opentextbooks/textbooks.json
 *   (~730 KB JSON, includes ISBN13, license, subjects, formats with read URLs)
 * - The feed is paginated server-side (~10 records/page); the site's own UI
 *   uses it. No documented search endpoint -> catalog cached + filtered locally.
 */

const FEED_TTL = 12 * 3600;
const MAX_FEED_PAGES = 40; // safety cap; feed currently ~700+ books

interface OtlSubject {
  name?: string;
}
interface OtlFormat {
  type?: string;
  url?: string;
}
interface OtlPublisher {
  name?: string;
}
interface OtlContributor {
  name?: string;
  role?: string;
}
interface OtlBook {
  id: number;
  title?: string;
  description?: string | null;
  copyright_year?: number | null;
  isbn10?: string | null;
  isbn13?: string | null;
  license?: string | null;
  language?: string | null;
  url?: string | null;
  updated_at?: string | null;
  subjects?: OtlSubject[] | null;
  contributors?: OtlContributor[] | null;
  publishers?: OtlPublisher[] | null;
  formats?: OtlFormat[] | null;
}

const SUBJECT_MAP: Record<string, { subject: string; level: EducationLevel }> = {
  accounting: { subject: "accounting", level: "university" },
  business: { subject: "business", level: "university" },
  finance: { subject: "accounting", level: "university" },
  economics: { subject: "economics", level: "university" },
  mathematics: { subject: "mathematics", level: "university" },
  math: { subject: "mathematics", level: "university" },
  statistics: { subject: "mathematics", level: "university" },
  physics: { subject: "physics", level: "university" },
  chemistry: { subject: "chemistry", level: "university" },
  biology: { subject: "biology", level: "university" },
  "computer science": { subject: "computer-science", level: "university" },
  "information systems": { subject: "information-technology", level: "university" },
  engineering: { subject: "engineering", level: "university" },
  history: { subject: "history", level: "university" },
  geography: { subject: "geography", level: "university" },
  education: { subject: "professional", level: "professional" },
  "health sciences": { subject: "health", level: "university" },
  nursing: { subject: "health", level: "university" },
  medicine: { subject: "health", level: "professional" },
  law: { subject: "professional", level: "professional" },
  psychology: { subject: "health", level: "university" },
  sociology: { subject: "history", level: "university" },
  philosophy: { subject: "literature", level: "university" },
  "language arts": { subject: "languages", level: "university" },
  music: { subject: "arts", level: "university" },
  art: { subject: "arts", level: "university" },
};

export function normalizeOtl(b: OtlBook): EducationResource {
  const subjects: string[] = [];
  const levels = new Set<EducationLevel>();
  for (const s of b.subjects ?? []) {
    const key = s.name?.toLowerCase().trim();
    if (!key) continue;
    const mapped = SUBJECT_MAP[key];
    if (mapped) {
      if (!subjects.includes(mapped.subject)) subjects.push(mapped.subject);
      levels.add(mapped.level);
    } else if (!subjects.includes(key)) {
      subjects.push(key); // verbatim unknowns preserved
    }
  }
  // OTL is explicitly a college textbook library.
  if (levels.size === 0) levels.add("university");

  const formats = [...new Set((b.formats ?? []).map((f) => f.type?.toLowerCase()).filter(Boolean) as string[])];
  const onlineFormat = (b.formats ?? []).find((f) => f.type?.toLowerCase() === "online");
  const authors = (b.contributors ?? [])
    .filter((c) => c.name && (!c.role || /author/i.test(c.role)))
    .slice(0, 20)
    .map((c) => ({ name: c.name! }));

  return EducationResourceSchema.parse({
    id: `edu:otl:${b.id}`,
    title: (b.title ?? "").trim(),
    description: b.description?.slice(0, 2000) ?? null,
    authors,
    publisher: b.publishers?.[0]?.name ?? "Open Textbook Library",
    year: b.copyright_year ?? null,
    language: otlLang(b.language),
    educationLevel: [...levels],
    grade: null,
    subject: subjects,
    topic: null,
    resourceType: "textbook",
    format: formatList(b),
    source: "otl",
    sourceId: String(b.id),
    sourceUrl: b.url ?? null,
    readUrl: onlineFormat?.url ?? b.url ?? null,
    license: b.license ?? null,
    updatedAt: b.updated_at ?? null,
    thumbnail: null,
    metadata: { isbn13: b.isbn13 ?? null },
    sources: ["otl"],
  });
}

function formatList(b: OtlBook): string[] {
  return [...new Set((b.formats ?? []).map((f) => f.type?.toLowerCase()).filter(Boolean) as string[])];
}

function otlLang(code: string | null | undefined): string {
  if (!code) return "en";
  const c = code.slice(0, 2).toLowerCase();
  return c || "en";
}

async function fetchFeedPage(page: number): Promise<OtlBook[]> {
  const res = await fetch(`https://open.umn.edu/opentextbooks/textbooks.json?page=${page}`, {
    headers: { accept: "application/json", "user-agent": "Cogniflux/0.1 (education discovery)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`otl feed HTTP ${res.status}`);
  const data = (await res.json()) as { data?: OtlBook[] };
  return data.data ?? [];
}

let feedMemo: { at: number; books: OtlBook[] } | null = null;

/** Fetch the full paginated catalog. Memoized in-process; Redis-cached upstream. */
export async function getOtlCatalog(): Promise<OtlBook[]> {
  if (feedMemo && Date.now() - feedMemo.at < 30 * 60_000) return feedMemo.books;
  const all: OtlBook[] = [];
  for (let page = 1; page <= MAX_FEED_PAGES; page++) {
    const batch = await fetchFeedPage(page);
    all.push(...batch);
    if (batch.length < 10) break; // last page
  }
  feedMemo = { at: Date.now(), books: all };
  return all;
}

function matchesFilters(r: EducationResource, p: EducationSearchParams): boolean {
  if (p.level.length && !p.level.some((l) => r.educationLevel.includes(l))) return false;
  if (p.subject.length && !p.subject.some((s) => r.subject.includes(s))) return false;
  if (p.resourceType.length && !p.resourceType.includes(r.resourceType)) return false;
  if (p.language.length && !p.language.includes(r.language)) return false;
  if (p.yearFrom && r.year && r.year < p.yearFrom) return false;
  if (p.yearTo && r.year && r.year > p.yearTo) return false;
  return true;
}

export class OpenTextbookLibraryProvider implements EducationProvider {
  readonly id = "otl";
  readonly name = "Open Textbook Library";
  readonly homepageUrl = "https://open.umn.edu/opentextbooks";
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
    const books = await getOtlCatalog();
    const terms = params.q.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    let resources = books.map(normalizeOtl).filter((r) => {
      const hay = `${r.title} ${r.description ?? ""} ${r.subject.join(" ")} ${r.metadata.isbn13 ?? ""}`.toLowerCase();
      const qMatch = terms.length === 0 || terms.some((t) => hay.includes(t));
      return qMatch && matchesFilters(r, params);
    });
    resources = resources.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    const total = resources.length;
    const start = (params.page - 1) * params.perPage;
    return {
      resources: resources.slice(start, start + params.perPage),
      total,
      page: params.page,
      perPage: params.perPage,
      providersUsed: ["otl"],
      providersFailed: [],
      degraded: false,
    };
  }

  async getResource(sourceId: string): Promise<EducationResource | null> {
    const books = await getOtlCatalog();
    const book = books.find((x) => String(x.id) === sourceId);
    return book ? normalizeOtl(book) : null;
  }
}
