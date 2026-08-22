import { z } from "zod";

/** Canonical normalized work schema. Every provider result is mapped into this shape before it reaches the UI or cache. */
export const WorkSchema = z.object({
  id: z.string(), // canonical: doi:<doi> | oa:<openalex id> | <provider>:<native id>
  title: z.string(),
  authors: z.array(z.object({ name: z.string(), orcid: z.string().optional() })).default([]),
  abstract: z.string().nullable().default(null),
  publicationYear: z.number().nullable().default(null),
  journal: z.string().nullable().default(null),
  publisher: z.string().nullable().default(null),
  doi: z.string().nullable().default(null),
  url: z.string().nullable().default(null),
  source: z.string(), // provider id, e.g. "openalex"
  sources: z.array(z.string()).default([]), // all providers that matched (post-dedup)
  type: z.enum(["article", "preprint", "book", "book-chapter", "dataset", "other"]).default("other"),
  language: z.string().nullable().default(null),
  subjects: z.array(z.string()).default([]),
  citationCount: z.number().nullable().default(null),
  openAccess: z
    .object({
      isOa: z.boolean().default(false),
      url: z.string().nullable().default(null),
      license: z.string().nullable().default(null),
    })
    .default({ isOa: false, url: null, license: null }),
  fullTextUrl: z.string().nullable().default(null),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type Work = z.infer<typeof WorkSchema>;

export const SearchParamsSchema = z.object({
  q: z.string().min(1).max(500),
  page: z.coerce.number().int().min(1).max(100).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(20),
  yearFrom: z.coerce.number().int().min(1500).optional(),
  yearTo: z.coerce.number().int().max(2100).optional(),
  openAccessOnly: z.coerce.boolean().default(false),
  sort: z.enum(["relevance", "newest", "citations"]).default("relevance"),
});
export type SearchParams = z.infer<typeof SearchParamsSchema>;

export const SearchResultSchema = z.object({
  works: z.array(WorkSchema),
  total: z.number(), // best-effort estimate across providers
  page: z.number(),
  perPage: z.number(),
  providersUsed: z.array(z.string()),
  providersFailed: z.array(z.string()),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;
