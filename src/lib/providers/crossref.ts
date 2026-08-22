import type { SearchParams, SearchResult, Work } from "../types";
import { AcademicProvider, NO_CAPABILITIES, ProviderUnsupported } from "./types";

/**
 * Crossref provider - open REST API, no key required (polite pool via mailto).
 * API: https://api.crossref.org/works
 */
const BASE = "https://api.crossref.org";

interface CrossrefItem {
  DOI?: string;
  title?: string[];
  author?: Array<{ given?: string; family?: string; ORCID?: string }>;
  abstract?: string;
  "published-print"?: { "date-parts"?: number[][] };
  "published-online"?: { "date-parts"?: number[][] };
  issued?: { "date-parts"?: number[][] };
  "container-title"?: string[];
  publisher?: string;
  type?: string;
  language?: string;
  subject?: string[];
  "is-referenced-by-count"?: number;
  URL?: string;
  license?: Array<{ URL?: string }>;
  link?: Array<{ URL?: string; "content-type"?: string }>;
}

function yearOf(item: CrossrefItem): number | null {
  const parts =
    item["published-online"]?.["date-parts"] ??
    item["published-print"]?.["date-parts"] ??
    item.issued?.["date-parts"];
  return parts?.[0]?.[0] ?? null;
}

/** Strip JATS/XML tags from Crossref abstracts. */
function cleanAbstract(raw?: string): string | null {
  if (!raw) return null;
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000) || null;
}

export function normalizeCrossref(item: CrossrefItem): Work | null {
  const title = item.title?.[0]?.trim();
  if (!title) return null;
  const doi = item.DOI?.toLowerCase() ?? null;
  const pdfLink = item.link?.find((l) => l["content-type"] === "application/pdf")?.URL ?? null;
  return {
    id: doi ? `doi:${doi}` : `crossref:${item.DOI ?? title}`,
    title,
    authors: (item.author ?? [])
      .map((a) => ({
        name: [a.given, a.family].filter(Boolean).join(" ").trim(),
        orcid: a.ORCID?.replace("http://orcid.org/", "").replace("https://orcid.org/", ""),
      }))
      .filter((a) => a.name)
      .slice(0, 50),
    abstract: cleanAbstract(item.abstract),
    publicationYear: yearOf(item),
    journal: item["container-title"]?.[0] ?? null,
    publisher: item.publisher ?? null,
    doi,
    url: item.URL ?? (doi ? `https://doi.org/${doi}` : null),
    source: "crossref",
    sources: ["crossref"],
    type:
      item.type === "journal-article"
        ? "article"
        : item.type === "book"
          ? "book"
          : item.type === "proceedings-article"
            ? "article"
            : item.type === "dataset"
              ? "dataset"
              : "other",
    language: item.language ?? null,
    subjects: (item.subject ?? []).slice(0, 5),
    citationCount: typeof item["is-referenced-by-count"] === "number" ? item["is-referenced-by-count"] : null,
    openAccess: {
      isOa: false, // Crossref does not reliably report OA; Unpaywall enrichment happens at orchestrator level.
      url: pdfLink ?? null,
      license: item.license?.[0]?.URL ?? null,
    },
    fullTextUrl: pdfLink,
    metadata: {},
  };
}

export class CrossrefProvider implements AcademicProvider {
  readonly id = "crossref";
  readonly timeoutMs = 8000;
  readonly capabilities = { ...NO_CAPABILITIES, search: true };

  async search(params: SearchParams): Promise<SearchResult> {
    const doiMatch = params.q.trim().match(/^(10\.\d{4,9}\/\S+)$/i);
    if (doiMatch) return { works: [], total: 0, page: params.page, perPage: params.perPage, providersUsed: [], providersFailed: [] };

    const sp = new URLSearchParams({
      query: params.q,
      rows: String(params.perPage),
      offset: String((params.page - 1) * params.perPage),
    });
    if (params.yearFrom) sp.set("filter", `from-pub-date:${params.yearFrom}-01-01`);
    if (params.yearTo) sp.set("filter", `until-pub-date:${params.yearTo}-12-31`);
    if (params.sort === "newest") sp.set("sort", "published");
    else if (params.sort === "citations") sp.set("sort", "is-referenced-by-count");

    const res = await fetch(`${BASE}/works?${sp.toString()}${process.env.UNPAYWALL_EMAIL ? `&mailto=${encodeURIComponent(process.env.UNPAYWALL_EMAIL)}` : ""}`, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`crossref HTTP ${res.status}`);
    const data = (await res.json()) as {
      message: { items: CrossrefItem[]; "total-results": number };
    };
    const works = data.message.items.map(normalizeCrossref).filter((w): w is Work => !!w);
    return {
      works,
      total: data.message["total-results"] ?? works.length,
      page: params.page,
      perPage: params.perPage,
      providersUsed: works.length ? [this.id] : [],
      providersFailed: [],
    };
  }

  async getWork(_id: string): Promise<Work | null> {
    throw new ProviderUnsupported(this.id, "getWork");
  }
}
