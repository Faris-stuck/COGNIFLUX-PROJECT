import { z } from "zod";

/**
 * Canonical education schemas + taxonomy.
 *
 * Design rules:
 * - Canonical levels are internal English slugs; UI labels are localized elsewhere.
 * - Subjects are a flexible string vocabulary (extendable without migration),
 *   normalized via SUBJECT_ALIASES at the edges.
 * - Provider-specific metadata is preserved in `metadata`; we never over-normalize.
 */

export const EDUCATION_LEVELS = [
  "elementary",
  "middle-school",
  "high-school",
  "vocational",
  "university",
  "professional",
] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

/** Localized labels for canonical levels. */
export const LEVEL_LABELS: Record<EducationLevel, { en: string; id: string }> = {
  elementary: { en: "Elementary", id: "SD" },
  "middle-school": { en: "Middle School", id: "SMP" },
  "high-school": { en: "High School", id: "SMA" },
  vocational: { en: "Vocational", id: "SMK" },
  university: { en: "University", id: "Universitas" },
  professional: { en: "Professional", id: "Profesional" },
};

export const RESOURCE_TYPES = [
  "textbook",
  "article",
  "lesson",
  "course",
  "module",
  "exercise",
  "reference",
  "interactive",
  "video",
  "other",
] as const;
export type EducationResourceType = (typeof RESOURCE_TYPES)[number];

/**
 * Subject taxonomy v1. Flat extendable list; add a slug here and an alias row
 * when a provider calls it something else. Unknown provider subjects are kept
 * verbatim in resource.subject and metadata - never dropped.
 */
export const EDUCATION_SUBJECTS = [
  "mathematics",
  "physics",
  "chemistry",
  "biology",
  "computer-science",
  "programming",
  "information-technology",
  "engineering",
  "electronics",
  "networking",
  "automotive",
  "accounting",
  "economics",
  "business",
  "history",
  "geography",
  "languages",
  "literature",
  "arts",
  "design",
  "health",
  "agriculture",
  "hospitality",
  "manufacturing",
] as const;
export type EducationSubject = (typeof EDUCATION_SUBJECTS)[number];

export const SUBJECT_LABELS: Record<EducationSubject, { en: string; id: string }> = {
  mathematics: { en: "Mathematics", id: "Matematika" },
  physics: { en: "Physics", id: "Fisika" },
  chemistry: { en: "Chemistry", id: "Kimia" },
  biology: { en: "Biology", id: "Biologi" },
  "computer-science": { en: "Computer Science", id: "Ilmu Komputer" },
  programming: { en: "Programming", id: "Pemrograman" },
  "information-technology": { en: "Information Technology", id: "Teknologi Informasi" },
  engineering: { en: "Engineering", id: "Teknik" },
  electronics: { en: "Electronics", id: "Elektronika" },
  networking: { en: "Networking", id: "Jaringan" },
  automotive: { en: "Automotive", id: "Otomotif" },
  accounting: { en: "Accounting", id: "Akuntansi" },
  economics: { en: "Economics", id: "Ekonomi" },
  business: { en: "Business", id: "Bisnis" },
  history: { en: "History", id: "Sejarah" },
  geography: { en: "Geography", id: "Geografi" },
  languages: { en: "Languages", id: "Bahasa" },
  literature: { en: "Literature", id: "Sastra" },
  arts: { en: "Arts", id: "Seni" },
  design: { en: "Design", id: "Desain" },
  health: { en: "Health", id: "Kesehatan" },
  agriculture: { en: "Agriculture", id: "Pertanian" },
  hospitality: { en: "Hospitality", id: "Perhotelan" },
  manufacturing: { en: "Manufacturing", id: "Manufaktur" },
};

/** Provider phrasing -> canonical subject. Extendable. */
export const SUBJECT_ALIASES: Record<string, EducationSubject> = {
  math: "mathematics",
  mathematics: "mathematics",
  matemáticas: "mathematics",
  matematika: "mathematics",
  calculus: "mathematics",
  algebra: "mathematics",
  statistics: "mathematics",
  physics: "physics",
  fisika: "physics",
  física: "physics",
  chemistry: "chemistry",
  kimia: "chemistry",
  biología: "biology",
  science: "biology", // OpenStax generic "Science" bucket maps to its largest branch
  sains: "biology",
  biology: "biology",
  biologi: "biology",
  "anatomy & physiology": "health",
  "computer science": "computer-science",
  "information technology": "information-technology",
  programming: "programming",
  pemrograman: "programming",
  engineering: "engineering",
  teknik: "engineering",
  electronics: "electronics",
  elektronika: "electronics",
  networking: "networking",
  jaringan: "networking",
  automotive: "automotive",
  otomotif: "automotive",
  accounting: "accounting",
  akuntansi: "accounting",
  finance: "accounting",
  economics: "economics",
  ekonomi: "economics",
  economy: "economics",
  business: "business",
  bisnis: "business",
  empresarial: "business",
  history: "history",
  sejarah: "history",
  geography: "geography",
  geografi: "geography",
  languages: "languages",
  bahasa: "languages",
  literature: "literature",
  sastra: "literature",
  arts: "arts",
  seni: "arts",
  design: "design",
  desain: "design",
  health: "health",
  kesehatan: "health",
  "health science": "health",
  nursing: "health",
  agriculture: "agriculture",
  pertanian: "agriculture",
  hospitality: "hospitality",
  perhotelan: "hospitality",
  manufacturing: "manufacturing",
  manufaktur: "manufacturing",
  "college success": "professional" as unknown as EducationSubject, // level-style alias kept for OpenStax buckets
};

export function normalizeSubject(raw: string): EducationSubject | null {
  const key = raw.toLowerCase().trim();
  return SUBJECT_ALIASES[key] ?? null;
}

// ---------- Canonical resource schema ----------

export const EducationResourceSchema = z.object({
  id: z.string(), // edu:<provider>:<sourceId> canonical
  title: z.string(),
  description: z.string().nullable().default(null),
  authors: z.array(z.object({ name: z.string() })).default([]),
  publisher: z.string().nullable().default(null),
  year: z.number().int().nullable().default(null),
  language: z.string().default("en"), // ISO 639-1 best-effort
  educationLevel: z.array(z.enum(EDUCATION_LEVELS)).default([]),
  grade: z.number().int().min(1).max(16).nullable().default(null), // 1-6 SD, 7-9 SMP, 10-12 SMA/SMK, 13+ uni
  subject: z.array(z.string()).default([]), // canonical slugs + verbatim extras allowed
  topic: z.string().nullable().default(null),
  resourceType: z.enum(RESOURCE_TYPES).default("other"),
  format: z.array(z.string()).default([]), // pdf, html, epub...
  source: z.string(), // provider id
  sourceId: z.string(),
  sourceUrl: z.string().url().nullable().default(null),
  readUrl: z.string().url().nullable().default(null),
  license: z.string().nullable().default(null),
  updatedAt: z.string().nullable().default(null),
  thumbnail: z.string().url().nullable().default(null),
  metadata: z.record(z.string(), z.unknown()).default({}), // original provider payload subset
  sources: z.array(z.string()).default([]), // merged after dedup
});
export type EducationResource = z.infer<typeof EducationResourceSchema>;

export const EducationSearchParamsSchema = z.object({
  q: z.string().min(1).max(500),
  page: z.coerce.number().int().min(1).max(100).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(20),
  level: z.array(z.enum(EDUCATION_LEVELS)).default([]),
  grade: z.coerce.number().int().min(1).max(16).optional(),
  subject: z.array(z.string().max(50)).default([]),
  language: z.array(z.string().max(5)).default([]),
  resourceType: z.array(z.enum(RESOURCE_TYPES)).default([]),
  format: z.array(z.string().max(20)).default([]),
  yearFrom: z.coerce.number().int().min(1500).optional(),
  yearTo: z.coerce.number().int().max(2100).optional(),
  provider: z.array(z.string().max(40)).default([]),
});
export type EducationSearchParams = z.infer<typeof EducationSearchParamsSchema>;

export interface EducationSearchResult {
  resources: EducationResource[];
  total: number;
  page: number;
  perPage: number;
  providersUsed: string[];
  providersFailed: string[];
  degraded: boolean;
}
