import type { SearchParams, SearchResult, Work } from "../types";
import { AcademicProvider, NO_CAPABILITIES, ProviderUnsupported } from "./types";

/**
 * OpenAlex provider - fully open, no API key required.
 * API: https://api.openalex.org/ (polite pool via mailto param)
 */
const BASE = "https://api.openalex.org";

interface OpenAlexWork {
  id: string;
  doi: string | null;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  cited_by_count?: number;
  type?: string;
  language?: string;
  primary_location?: {
    source?: { display_name?: string; publisher_name?: string } | null;
    landing_page_url?: string | null;
    pdf_url?: string | null;
  } | null;
  best_oa_location?: {
    pdf_url?: string | null;
    landing_page_url?: string | null;
    license?: string | null;
  } | null;
  open_access?: { is_oa?: boolean; oa_url?: string | null };
  authorships?: Array<{ author?: { display_name?: string; orcid?: string } }>;
  concepts?: Array<{ display_name?: string; score?: number }>;
  abstract_inverted_index?: Record<string, number[]> | null;
}

/** OpenAlex stores abstracts as an inverted index; rebuild plain text. */
function rebuildAbstract(inv: Record<string, number[]> | null | undefined): string | null {
  if (!inv) return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(inv)) {
    for (const pos of positions) words[pos] = word;
  }
  return words.filter(Boolean).join(" ").slice(0, 4000);
}

function mapType(t?: string): Work["type"] {
  switch (t) {
    case "article":
    case "journal-article":
      return "article";
    case "preprint":
      return "preprint";
    case "book":
      return "book";
    case "book-chapter":
      return "book-chapter";
    case "dataset":
      return "dataset";
    default:
      return "other";
  }
}

export function normalizeOpenAlex(w: OpenAlexWork): Work {
  const doi = w.doi ? w.doi.replace(/^https?:\/\/doi\.org\//i, "").toLowerCase() : null;
  return {
    id: doi ? `doi:${doi}` : w.id.replace("https://openalex.org/", "oa:"),
    title: (w.display_name ?? w.title ?? "").trim(),
    authors: (w.authorships ?? [])
      .map((a) => ({ name: a.author?.display_name ?? "", orcid: a.author?.orcid?.replace("https://orcid.org/", "") }))
      .filter((a) => a.name)
      .slice(0, 50),
    abstract: rebuildAbstract(w.abstract_inverted_index),
    publicationYear: w.publication_year ?? null,
    journal: w.primary_location?.source?.display_name ?? null,
    publisher: w.primary_location?.source?.publisher_name ?? null,
    doi,
    url: w.primary_location?.landing_page_url ?? (doi ? `https://doi.org/${doi}` : null),
    source: "openalex",
    sources: ["openalex"],
    type: mapType(w.type),
    language: w.language ?? null,
    subjects: (w.concepts ?? [])
      .slice(0, 5)
      .map((c) => c.display_name)
      .filter((n): n is string => !!n),
    citationCount: typeof w.cited_by_count === "number" ? w.cited_by_count : null,
    openAccess: {
      isOa: !!w.open_access?.is_oa,
      url: w.open_access?.oa_url ?? w.best_oa_location?.pdf_url ?? null,
      license: w.best_oa_location?.license ?? null,
    },
    fullTextUrl: w.best_oa_location?.pdf_url ?? null,
    metadata: {},
  };
}

export class OpenAlexProvider implements AcademicProvider {
  readonly id = "openalex";
  readonly timeoutMs = 8000;
  readonly capabilities = { ...NO_CAPABILITIES, search: true, getWork: true };

  private async fetchJson<T>(path: string): Promise<T> {
    const mailto = process.env.UNPAYWALL_EMAIL || process.env.OPENALEX_API_KEY;
    const sep = path.includes("?") ? "&" : "?";
    const url = `${BASE}${path}${sep}${mailto ? `mailto=${encodeURIComponent(mailto.split("@")[0] ? mailto : "contact@cogniflux.app")}` : "mailto=contact@cogniflux.app"}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`openalex HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  async search(params: SearchParams): Promise<SearchResult> {
    const filters: string[] = [];
    if (params.yearFrom) filters.push(`from_publication_date:${params.yearFrom}-01-01`);
    if (params.yearTo) filters.push(`to_publication_date:${params.yearTo}-12-31`);
    if (params.openAccessOnly) filters.push("is_oa:true");

    // If the query looks like a bare DOI, search by DOI directly.
    const doiMatch = params.q.trim().match(/^(10\.\d{4,9}\/\S+)$/i);
    if (doiMatch) {
      try {
        const work = await this.getWork(`doi:${doiMatch[1].toLowerCase()}`);
        if (work) {
          return { works: [work], total: 1, page: params.page, perPage: params.perPage, providersUsed: [this.id], providersFailed: [] };
        }
      } catch {
        /* fall through to text search */
      }
    }

    const search = new URLSearchParams({
      search: params.q,
      per_page: String(params.perPage),
      page: String(params.page),
    });
    if (filters.length) search.set("filter", filters.join(","));
    if (params.sort === "newest") search.set("sort", "publication_date:desc");
    else if (params.sort === "citations") search.set("sort", "cited_by_count:desc");

    const data = await this.fetchJson<{ results: OpenAlexWork[]; meta: { count: number } }>(
      `/works?${search.toString()}`
    );
    return {
      works: data.results.map(normalizeOpenAlex),
      total: data.meta?.count ?? data.results.length,
      page: params.page,
      perPage: params.perPage,
      providersUsed: [this.id],
      providersFailed: [],
    };
  }

  async getWork(id: string): Promise<Work | null> {
    let path: string;
    if (id.startsWith("doi:")) path = `/works/doi:${id.slice(4)}`;
    else if (id.startsWith("oa:")) path = `/works/${id.slice(3)}`;
    else return null;
    try {
      const w = await this.fetchJson<OpenAlexWork>(path);
      return normalizeOpenAlex(w);
    } catch {
      return null;
    }
  }
}
