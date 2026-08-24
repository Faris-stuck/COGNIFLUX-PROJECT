import { XMLParser } from "fast-xml-parser";
import type { PaperDocument, DocSection, DocBlock, DocReference } from "./document";
import { PaperDocumentSchema, AnchorRegistry } from "./document";
import { sanitizeHtml, htmlToText, safeImageUrl, extractDoi } from "./sanitize";

/**
 * JATS XML -> canonical PaperDocument.
 *
 * Europe PMC (and PMC generally) expose open-access full text as JATS. The
 * parser uses preserveOrder so mixed-content inline ordering is preserved
 * exactly ("text <italic>more</italic> text" must not be reordered), while
 * lookup helpers (first/child/all) keep section extraction readable.
 *
 * Ordered shape: [{ tag: [children...], ":@": {"@attr": val} }, ...]
 */

/** A node in preserveOrder shape: {tag: children, ":@": attrs} entries. */
type ONode = Record<string, unknown>;
type ODoc = ONode[];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  preserveOrder: true,
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
});

function parseOrdered(xml: string): ODoc {
  return parser.parse(xml) as ODoc;
}

function attrsOf(node: ONode): Record<string, string> {
  return (node[":@"] as Record<string, string> | undefined) ?? {};
}

function attrOf(node: ONode, name: string): string | undefined {
  const a = attrsOf(node);
  const hit = a[`@${name}`] ?? a[`@xlink:${name}`];
  return typeof hit === "string" ? hit : undefined;
}

/** Tag name of an ordered node ("#text" for text nodes). */
export function otag(node: ONode): string {
  const keys = Object.keys(node).filter((k) => k !== ":@");
  return keys.length > 0 ? keys[0] : "#text";
}

/** Children of the node's single element (empty for text nodes). */
function kidsOf(node: ONode): ODoc {
  const tag = otag(node);
  if (tag === "#text") return [];
  const v = node[tag];
  return Array.isArray(v) ? (v as ODoc) : v == null ? [] : [v as ONode];
}

function textNodesOf(nodes: ODoc): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    const t = otag(n);
    if (t === "#text") out.push(String(n["#text"] ?? ""));
    else {
      // recurse into element children
      out.push(...textNodesOf(kidsOf(n)));
    }
  }
  return out;
}

function firstByTag(nodes: ODoc, tag: string): ONode | null {
  for (const n of nodes) if (otag(n) === tag) return n;
  return null;
}

function allByTag(nodes: ODoc, tag: string): ONode[] {
  return nodes.filter((n) => otag(n) === tag);
}

// ---------------------------------------------------------------------------
// Text & HTML serialization
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function collectSafeAttrs(node: ONode, skipHrefSrc: boolean): string {
  let s = "";
  for (const [k, v] of Object.entries(attrsOf(node))) {
    const name = k.replace(/^@/, "").replace(/^xlink:/, "");
    if (name === "xmlns" || name.startsWith("xmlns:")) continue;
    if (!/^[a-z-]+$/i.test(name)) continue;
    if (skipHrefSrc && (name === "href" || name === "src")) continue; // handled explicitly
    s += ` ${name}="${escapeHtml(v)}"`;
  }
  return s;
}

/** Plain text of a subtree in document order. */
function oText(node: ONode): string {
  const t = otag(node);
  if (t === "#text") return String(node["#text"] ?? "");
  return textNodesOf(kidsOf(node)).join("");
}

/** Serialize JATS subtree to sanitized inline HTML, preserving order. */
function toHtml(nodes: ODoc): string {
  let html = "";
  for (const node of nodes) {
    const tag = otag(node);
    if (tag === "#text") {
      html += escapeHtml(String(node["#text"] ?? ""));
      continue;
    }
    switch (tag) {
      case "italic":
        html += `<em>${toHtml(kidsOf(node))}</em>`;
        break;
      case "bold":
        html += `<strong>${toHtml(kidsOf(node))}</strong>`;
        break;
      case "underline":
        html += `<u>${toHtml(kidsOf(node))}</u>`;
        break;
      case "sub":
        html += `<sub>${toHtml(kidsOf(node))}</sub>`;
        break;
      case "sup":
        html += `<sup>${toHtml(kidsOf(node))}</sup>`;
        break;
      case "sc":
      case "monospace":
        html += `<code>${toHtml(kidsOf(node))}</code>`;
        break;
      case "styled-content":
        html += toHtml(kidsOf(node));
        break;
      case "xref": {
        // Keep visible label only; resolution happens via references list / UI layer.
        const rid = attrOf(node, "rid");
        const inner = toHtml(kidsOf(node));
        html += rid
          ? `<span data-xref="${escapeHtml(rid)}">${inner}</span>`
          : inner;
        break;
      }
      case "ext-link":
      case "uri": {
        const href = attrOf(node, "href");
        const safe = safeImageUrl(typeof href === "string" ? href : undefined);
        const inner = toHtml(kidsOf(node)) || (safe ? escapeHtml(safe) : "");
        html += safe
          ? `<a href="${escapeHtml(safe)}" rel="noopener noreferrer nofollow">${inner}</a>`
          : inner;
        break;
      }
      case "break":
        html += "<br/>";
        break;
      case "inline-formula":
      case "disp-formula":
      case "math":
        // Preserve MathML subtree raw; sanitizer allows math tags.
        html += toHtmlRaw([node]);
        break;
      case "list": {
        const items = allByTag(kidsOf(node), "list-item");
        const lis = items.map((li) => `<li>${toHtml(kidsOf(li))}</li>`).join("");
        const type = attrOf(node, "list-type") ?? "";
        html += /^order/i.test(type) ? `<ol>${lis}</ol>` : `<ul>${lis}</ul>`;
        break;
      }
      case "title":
      case "label":
        html += toHtml(kidsOf(node));
        break;
      default:
        // Unknown elements: keep their content (inline passthrough).
        html += toHtml(kidsOf(node));
        break;
    }
  }
  return html;
}

/** Raw serialization preserving original tag names (tables, MathML). */
function toHtmlRaw(nodes: ODoc): string {
  let out = "";
  for (const node of nodes) {
    const tag = otag(node);
    if (tag === "#text") {
      out += escapeHtml(String(node["#text"] ?? ""));
      continue;
    }
    const attrs = collectSafeAttrs(node, false);
    out += `<${tag}${attrs}>${toHtmlRaw(kidsOf(node))}</${tag}>`;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Section extraction
// ---------------------------------------------------------------------------

function sectionTitle(secEl: ONode): string {
  const t = firstByTag(kidsOf(secEl), "title");
  return t ? htmlToText(toHtml(kidsOf(t))).trim() : "";
}

interface ExtractCtx {
  registry: AnchorRegistry;
}

function extractBlocksFromChildren(children: ODoc, blocks: DocBlock[], ctx: ExtractCtx): DocSection[] {
  const subs: DocSection[] = [];
  let paraBuf: ONode[] = [];

  const flushPara = () => {
    if (paraBuf.length === 0) return;
    const rawHtml = paraBuf.map((p) => toHtml([p])).join(" ");
    const html = sanitizeHtml(rawHtml);
    const text = htmlToText(html);
    if (text.length > 0) blocks.push({ type: "p", html, text });
    paraBuf = [];
  };

  for (const child of children) {
    const tag = otag(child);
    if (tag === "sec") {
      flushPara();
      subs.push(...extractSection([child], ctx));
      continue;
    }
    switch (tag) {
      case "p":
        paraBuf.push(child);
        break;
      case "fig": {
        flushPara();
        blocks.push(extractFigure(child as ONode));
        break;
      }
      case "table-wrap": {
        flushPara();
        blocks.push(extractTable(child as ONode));
        break;
      }
      case "disp-formula":
        paraBuf.push(child); // serialized via toHtml -> MathML path
        break;
      default:
        break;
    }
  }
  flushPara();
  return subs;
}

function extractSection(secNodes: ONode[], ctx: ExtractCtx): DocSection[] {
  const out: DocSection[] = [];
  for (const secEl of secNodes) {
    const title = sectionTitle(secEl);
    const anchor = ctx.registry.anchorFor(title || "Untitled section");
    const blocks: DocBlock[] = [];
    const subsections = extractBlocksFromChildren(kidsOf(secEl), blocks, ctx);
    out.push({ anchor, title: title || "Untitled section", level: 1, blocks });
    out.push(...subsections.map((s) => ({ ...s, level: 2 })));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Figures & tables
// ---------------------------------------------------------------------------

function extractFigure(figEl: ONode): DocBlock {
  const labelNode = firstByTag(kidsOf(figEl), "label");
  const label = labelNode ? htmlToText(toHtml(kidsOf(labelNode))).trim() : "";
  const capNode = firstByTag(kidsOf(figEl), "caption");
  const captionHtml = sanitizeHtml(capNode ? toHtml(kidsOf(capNode)) : "");
  // <graphic xlink:href="..."/> or media href
  const graphic =
    firstByTag(kidsOf(figEl), "graphic") ??
    firstByTag(kidsOf(figEl), "media") ??
    firstDeepByTag(kidsOf(figEl), ["graphic", "media"]);
  const rawUrl = graphic ? attrOf(graphic, "href") : undefined;
  return {
    type: "figure",
    id: attrOf(figEl, "id") ?? null,
    label: label || null,
    captionHtml,
    captionText: htmlToText(captionHtml),
    imageUrl: safeImageUrl(typeof rawUrl === "string" ? rawUrl : null),
  };
}

function firstDeepByTag(nodes: ODoc, tags: string[]): ONode | null {
  for (const n of nodes) {
    for (const tag of tags) {
      if (otag(n) === tag) return n;
    }
    const deep = firstDeepByTag(kidsOf(n), tags);
    if (deep) return deep;
  }
  return null;
}

function extractTable(twEl: ONode): DocBlock {
  const labelNode = firstByTag(kidsOf(twEl), "label");
  const label = labelNode ? htmlToText(toHtml(kidsOf(labelNode))).trim() : "";
  const capNode = firstByTag(kidsOf(twEl), "caption");
  const captionHtml = sanitizeHtml(capNode ? toHtml(kidsOf(capNode)) : "");
  const tableNode = firstByTag(kidsOf(twEl), "table") ?? firstByTag(kidsOf(twEl), "alternatives");
  let tableHtml = "";
  if (tableNode) {
    const raw = toHtmlRaw(kidsOf(tableNode));
    if (raw.includes("<table")) {
      // Already a full <table> subtree.
      tableHtml = sanitizeHtml(raw);
    } else {
      // Bare fragment (thead/tbody/rows): sanitize inside a <table> context
      // because the HTML parser drops table-only elements as fragments,
      // then keep the sanitized inner content wrapped in a real table.
      const wrapped = sanitizeHtml(`<table>${raw}</table>`);
      const m = wrapped.match(/<table[^>]*>([\s\S]*)<\/table>/i);
      tableHtml = m ? `<table>${m[1]}</table>` : "";
    }
  }
  return {
    type: "table",
    id: attrOf(twEl, "id") ?? null,
    label: label || null,
    captionHtml,
    captionText: htmlToText(captionHtml),
    tableHtml,
  };
}

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

function extractReferences(backNode: ONode | null, bodyNode: ONode | null): DocReference[] {
  // ref-list locations seen in the wild:
  //   a) <back><ref-list>
  //   b) <back><sec sec-type="ref-list"><ref-list>
  //   c) nested inside <body> ... <sec sec-type="ref-list"> ... <sec><ref-list>
  const candidates: ONode[] = [];
  const scan = (nodes: ODoc | null) => {
    if (!nodes) return;
    for (const rl of allByTag(nodes, "ref-list")) candidates.push(rl);
    for (const sec of allByTag(nodes, "sec")) scan(kidsOf(sec));
  };
  scan(bodyNode ? kidsOf(bodyNode) : []);
  scan(backNode ? kidsOf(backNode) : []);

  const out: DocReference[] = [];
  let index = 0;
  for (const refList of candidates) {
    for (const ref of allByTag(kidsOf(refList), "ref")) {
      const cite =
        firstByTag(kidsOf(ref), "mixed-citation") ??
        firstByTag(kidsOf(ref), "citation") ??
        firstByTag(kidsOf(ref), "element-citation");
      const html = sanitizeHtml(toHtml(cite ? kidsOf(cite) : []));
      const text = htmlToText(html).replace(/^\d+[.)]\s*/, "");
      if (!text && !html) continue;
      index += 1;
      const label = firstByTag(kidsOf(ref), "label");
      const prefix = label ? `${htmlToText(toHtml(kidsOf(label))).trim()} ` : "";
      out.push({
        index,
        html: prefix + html,
        text: (prefix + text).trim(),
        doi: extractDoi(text) ?? extractDoi(oText(ref)),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function normalizeJats(xml: string, meta: { paperId: string; providerId: string }): PaperDocument {
  const tree = parseOrdered(xml);
  // Root: the <article> element - skip any XML declaration/doctype nodes.
  const articleNode = tree.find((n) => otag(n) === "article") ?? null;
  const articleKids: ODoc = articleNode ? kidsOf(articleNode) : [];

  const front = firstByTag(articleKids, "front");
  const frontKids: ODoc = front ? kidsOf(front) : [];
  const journalMeta = firstByTag(frontKids, "journal-meta");
  const articleMeta = firstByTag(frontKids, "article-meta");
  const metaKids: ODoc = articleMeta ? kidsOf(articleMeta) : [];
  const body = firstByTag(articleKids, "body");
  const back = firstByTag(articleKids, "back");

  // --- metadata ---
  const titleGroup = firstByTag(metaKids, "title-group");
  const titleNode =
    (titleGroup ? firstByTag(kidsOf(titleGroup), "article-title") : null) ??
    firstByTag(metaKids, "title");
  const title = (titleNode ? htmlToText(toHtml(kidsOf(titleNode))) : "")
    .trim()
    .slice(0, 500)
    .trim() || null;

  const contribGroup = firstByTag(metaKids, "contrib-group");
  const authors = contribGroup
    ? allByTag(kidsOf(contribGroup), "contrib")
        .filter((c) => (attrOf(c, "contrib-type") ?? "author") === "author")
        .map((c) => {
          const name = firstByTag(kidsOf(c), "name");
          if (!name) {
            const fallback = htmlToText(toHtml(kidsOf(c))).slice(0, 120).trim();
            return { name: fallback || "Unknown" };
          }
          const given = oText(firstByTag(kidsOf(name), "given-names") ?? { "#text": "" }).trim();
          const family = oText(firstByTag(kidsOf(name), "surname") ?? { "#text": "" }).trim();
          return { name: [given, family].filter(Boolean).join(" ") || "Unknown" };
        })
        .slice(0, 100)
    : [];

  const journalTitleGroup = journalMeta ? firstByTag(kidsOf(journalMeta), "journal-title-group") : null;
  const journalTitleNode =
    (journalTitleGroup ? firstByTag(kidsOf(journalTitleGroup), "journal-title") : null) ??
    (journalMeta ? firstByTag(kidsOf(journalMeta), "journal-title") : null);
  const journal = journalTitleNode
    ? htmlToText(toHtml(kidsOf(journalTitleNode))).trim().slice(0, 200).trim() || null
    : null;

  let year: number | null = null;
  for (const pd of allByTag(metaKids, "pub-date")) {
    const y = firstByTag(kidsOf(pd), "year");
    if (y) {
      const ys = oText(y).trim();
      if (/^\d{4}$/.test(ys)) {
        year = Number(ys);
        break;
      }
    }
  }

  let doi: string | null = null;
  for (const idNode of allByTag(metaKids, "article-id")) {
    if ((attrOf(idNode, "pub-id-type") ?? "") === "doi") {
      const d = oText(idNode).trim().replace(/^doi:/i, "");
      if (d) {
        doi = d;
        break;
      }
    }
  }

  const abstractNode = firstByTag(metaKids, "abstract");
  const abstractText = abstractNode ? htmlToText(toHtml(kidsOf(abstractNode))).slice(0, 5000) : null;

  // --- sections ---
  const registry = new AnchorRegistry();
  const sections: DocSection[] = [];

  if (abstractText && abstractNode) {
    sections.push({
      anchor: registry.anchorFor("Abstract"),
      title: "Abstract",
      level: 1,
      blocks: [
        { type: "p", html: sanitizeHtml(toHtml(kidsOf(abstractNode))), text: abstractText },
      ],
    });
  }

  if (body) {
    const bodyKids = kidsOf(body);
    const flat: DocBlock[] = [];
    const named = extractBlocksFromChildren(bodyKids, flat, { registry });
    // Top-level stray paragraphs become an implicit main section before named ones.
    if (flat.length > 0) {
      sections.push({ anchor: registry.anchorFor("Main text"), title: "Main text", level: 1, blocks: flat });
    }
    sections.push(...named.map((s) => ({ ...s, level: 1 })));
  }

  const references = extractReferences(back ?? null, body ?? null);

  const approxChars =
    sections.reduce(
      (acc, s) =>
        acc +
        s.blocks.reduce((a, b) => {
          if (b.type === "p") return a + b.text.length;
          if (b.type === "figure") return a + b.captionText.length;
          return a + b.captionText.length;
        }, 0),
      0
    ) + references.reduce((a, r) => a + r.text.length, 0);

  const doc: PaperDocument = {
    paperId: meta.paperId,
    providerId: meta.providerId,
    title,
    authors,
    journal,
    year,
    doi,
    abstractText,
    sections,
    references,
    approxChars,
    retrievedAt: new Date().toISOString(),
  };

  return PaperDocumentSchema.parse(doc);
}
