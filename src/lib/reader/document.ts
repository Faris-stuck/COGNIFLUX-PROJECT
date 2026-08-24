import { z } from "zod";

/**
 * Canonical scientific full-text document schema (Phase 6 Reader).
 *
 * Design goals:
 * - Structured, not one giant plaintext blob: sections preserve reading and
 *   future AI-analysis boundaries (paragraphs, figures, tables).
 * - Stable anchors: section ids are deterministic slugs derived from the
 *   document itself, never random - they are stored in highlights.
 * - Untrusted-content aware: HTML payloads are sanitized at normalization
 *   time; text content is plain strings.
 */

export const DocParagraphSchema = z.object({
  type: z.literal("p"),
  /** Sanitized inline HTML (allowed: em, strong, sub, sup, a[href=http(s)], math as MathML string). */
  html: z.string(),
  /** Plain-text fallback / search corpus. */
  text: z.string(),
});

export const DocFigureSchema = z.object({
  type: z.literal("figure"),
  id: z.string().nullable().default(null),
  label: z.string().nullable().default(null),
  captionHtml: z.string(),
  captionText: z.string(),
  /** Absolute https image URL when the source provides one. */
  imageUrl: z.string().nullable().default(null),
});

export const DocTableSchema = z.object({
  type: z.literal("table"),
  id: z.string().nullable().default(null),
  label: z.string().nullable().default(null),
  captionHtml: z.string().default(""),
  captionText: z.string().default(""),
  /** Sanitized <table> HTML with structure preserved. */
  tableHtml: z.string(),
});

export const DocBlockSchema = z.discriminatedUnion("type", [
  DocParagraphSchema,
  DocFigureSchema,
  DocTableSchema,
]);

export const DocSectionSchema = z.object({
  /** Stable anchor used by highlights.section_anchor, e.g. "abstract", "methods". */
  anchor: z.string().min(1).max(120),
  title: z.string(),
  level: z.number().int().min(1).max(4).default(1),
  blocks: z.array(DocBlockSchema).default([]),
});

export const DocReferenceSchema = z.object({
  index: z.number().int().min(1),
  /** Sanitized citation HTML. */
  html: z.string(),
  text: z.string(),
  /** DOI when the reference carries one - enables Reference -> Paper Detail links. */
  doi: z.string().nullable().default(null),
});

export const PaperDocumentSchema = z.object({
  paperId: z.string(), // canonical Cogniflux paper key (doi:<...> | oa:<...>)
  providerId: z.string(),
  title: z.string().nullable().default(null),
  authors: z.array(z.object({ name: z.string() })).default([]),
  journal: z.string().nullable().default(null),
  year: z.number().int().nullable().default(null),
  doi: z.string().nullable().default(null),
  abstractText: z.string().nullable().default(null),
  sections: z.array(DocSectionSchema).min(1),
  references: z.array(DocReferenceSchema).default([]),
  /** Total approximate character count of readable text (payload sizing aid). */
  approxChars: z.number().int().min(0).default(0),
  retrievedAt: z.string(),
});

export type DocParagraph = z.infer<typeof DocParagraphSchema>;
export type DocFigure = z.infer<typeof DocFigureSchema>;
export type DocTable = z.infer<typeof DocTableSchema>;
export type DocBlock = z.infer<typeof DocBlockSchema>;
export type DocSection = z.infer<typeof DocSectionSchema>;
export type DocReference = z.infer<typeof DocReferenceSchema>;
export type PaperDocument = z.infer<typeof PaperDocumentSchema>;

/**
 * Deterministic anchor for a heading path. Canonical well-known headings map
 * to fixed anchors ("abstract", "methods", ...); anything else becomes a
 * slugified, collision-safe anchor derived from the title itself - so the
 * same paper always yields the same anchors across loads/revisions.
 */
const WELL_KNOWN: Array<[RegExp, string]> = [
  [/^abstract$/i, "abstract"],
  [/^(background|introduction|foreword)$/i, "introduction"],
  [/^related work/i, "related-work"],
  [/^(materials? and methods|methods|methodology|experimental procedures)$/i, "methods"],
  [/^(results?|findings)$/i, "results"],
  [/^(discussion|interpretation)/i, "discussion"],
  [/^(conclusions?|summary)$/i, "conclusion"],
  [/^limitations?/i, "limitations"],
  [/^(acknowledgements?|acknowledgments?|funding)$/i, "acknowledgements"],
  [/^data availability/i, "data-availability"],
  [/^(supplementary material|supplement)/i, "supplementary-material"],
  [/^references?$|^bibliography$/i, "references"],
];

export function slugifyAnchor(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "section"
  );
}

/** AnchorRegistry guarantees uniqueness deterministically within one load. */
export class AnchorRegistry {
  private used = new Set<string>();
  /** Memoized title -> anchor so the same heading always maps identically. */
  private memo = new Map<string, string>();

  anchorFor(title: string): string {
    const trimmed = title.trim();
    const hit = this.memo.get(trimmed);
    if (hit) return hit;
    const anchor = this.computeAnchor(trimmed);
    this.memo.set(trimmed, anchor);
    return anchor;
  }

  private computeAnchor(trimmed: string): string {
    for (const [re, canonical] of WELL_KNOWN) {
      if (re.test(trimmed) && !this.used.has(canonical)) {
        this.used.add(canonical);
        return canonical;
      }
    }
    let base = slugifyAnchor(trimmed);
    let candidate = base;
    let n = 2;
    while (this.used.has(candidate)) candidate = `${base}-${n++}`;
    this.used.add(candidate);
    return candidate;
  }
}
