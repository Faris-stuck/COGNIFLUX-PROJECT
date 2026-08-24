import DOMPurify from "isomorphic-dompurify";

/**
 * Server-side HTML sanitizer for untrusted external paper content (JATS
 * transformed to HTML, reference strings, captions).
 *
 * Allowlist keeps legitimate scientific formatting; everything else -
 * scripts, iframes, event handlers, javascript: URLs, style attributes,
 * embedded objects/SVG - is stripped before storage/cache/render.
 */

const ALLOWED_TAGS = [
  "p", "br", "em", "i", "strong", "b", "u", "sub", "sup", "span",
  "code", "pre", "kbd", "var", "samp",
  "ul", "ol", "li",
  "blockquote", "cite", "q",
  "a", "abbr", "small",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  "img", "figure", "figcaption",
  "math", "mrow", "mi", "mo", "mn", "msup", "msub", "mfrac", "msqrt", "mroot",
  "mtext", "mspace", "mstyle", "munder", "mover", "munderover", "mmultiscripts",
  "semantics", "annotation", "mtable", "mtr", "mtd", "mlabeledtr", "mpadded", "mphantom", "merror",
];

const ALLOWED_ATTR = ["href", "title", "alt", "src", "colspan", "rowspan", "scope", "start", "display", "encoding", "mathvariant"];

export function sanitizeHtml(dirty: string): string {
  const clean = DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "input", "button", "svg", "link", "meta", "base"],
    FORBID_ATTR: ["style", "class", "id", "onerror", "onload", "onclick"],
    // Force all links safe: no javascript:, no data:, keep https/mailto only.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
    // Non-URI attributes must be exempt from the URI regexp check, otherwise
    // DOMPurify drops colspan/rowspan/etc.
    ADD_URI_SAFE_ATTR: ["colspan", "rowspan", "scope", "start", "display", "encoding", "mathvariant"],
  });
  return clean;
}

/** Strip every tag - plain text for search corpus and highlight text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Make an absolute, safe image URL or null. */
export function safeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, "https://example.invalid");
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Extract a bare DOI from a string if present. */
export function extractDoi(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = s.match(/10\.\d{4,9}\/[^\s"'<>]+/i);
  return m ? m[0].replace(/[.,;)]+$/, "") : null;
}
