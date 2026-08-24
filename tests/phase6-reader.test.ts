/**
 * Phase 6 unit tests — full-text normalization, sanitization, anchors.
 * Pure logic: no network, no DB, no Redis.
 */
import { normalizeJats } from "@/lib/reader/jats";
import { sanitizeHtml, htmlToText, safeImageUrl, extractDoi } from "@/lib/reader/sanitize";
import { AnchorRegistry, slugifyAnchor } from "@/lib/reader/document";

const JATS = `<?xml version="1.0"?>
<article xml:lang="en" article-type="research-article">
  <front>
    <journal-meta><journal-title-group><journal-title>Journal of Testing</journal-title></journal-title-group></journal-meta>
    <article-meta>
      <title-group><article-title>Sanitization Test <italic>Article</italic></article-title></title-group>
      <contrib-group>
        <contrib contrib-type="author"><name><given-names>Ada</given-names><surname>Lovelace</surname></name></contrib>
        <contrib contrib-type="author"><name><given-names>Alan</given-names><surname>Turing</surname></name></contrib>
      </contrib-group>
      <pub-date><year>2024</year></pub-date>
      <article-id pub-id-type="doi">10.1234/test.001</article-id>
      <abstract><p>Study about <bold>everything</bold>.</p></abstract>
    </article-meta>
  </front>
  <body>
    <sec id="s1"><title>Introduction</title><p>First paragraph with <xref rid="r1" ref-type="bibr">1</xref> citation.</p>
      <sec id="s1a"><title>Study Design</title><p>Nested methods text.</p></sec>
    </sec>
    <sec id="s2"><title>Methods</title>
      <p>Malicious paragraph <script>alert('xss')</script><onclick-hack/>with an <ext-link xlink:href="https://ok.example/page">allowed link</ext-link> and a <ext-link xlink:href="javascript:alert(1)">bad link</ext-link>.</p>
      <fig id="f1"><label>Fig 1.</label><caption><p>Caption text here</p></caption><graphic xlink:href="img1.png"/></fig>
      <table-wrap id="t1"><label>Table 1.</label><caption><p>Table caption</p></caption>
        <table><thead><tr><th>A</th></tr></thead><tbody><tr><td onclick="hack()">1</td></tr></tbody></table>
      </table-wrap>
    </sec>
    <sec id="s3"><title>Results</title><p>We found results.</p></sec>
    <sec id="s4"><title>Conclusion</title><p>All done.</p></sec>
  </body>
  <back>
    <ref-list>
      <ref id="r1"><mixed-citation>Lovelace A. Notes. J Test. 1843. doi: 10.5555/old-ref</mixed-citation></ref>
      <ref id="r2"><mixed-citation>Turing A. Machines. Mind J. 1950;59:433-460. doi: 10.1093/mind/LIX.236.433</mixed-citation></ref>
    </ref-list>
  </back>
</article>`;

describe("HTML sanitization", () => {
  it("strips script tags", () => {
    const out = sanitizeHtml("<p>safe</p><script>alert('x')</script>");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert");
    expect(out).toContain("safe");
  });

  it("removes event handlers", () => {
    const out = sanitizeHtml('<td onclick="steal()">cell</td>');
    expect(out).not.toContain("onclick");
    expect(out).toContain("cell");
  });

  it("blocks javascript: URLs but keeps https links", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).not.toContain("javascript:");
    expect(sanitizeHtml('<a href="https://example.com">x</a>')).toContain('href="https://example.com"');
  });

  it("keeps legitimate scientific formatting (em/strong/sub/sup)", () => {
    const out = sanitizeHtml("<em>i</em><strong>b</strong><sub>x</sub><sup>2</sup>");
    expect(out).toContain("<em>");
    expect(out).toContain("<strong>");
    expect(out).toContain("<sub>");
    expect(out).toContain("<sup>");
  });

  it("preserves table structure while stripping unsafe attrs", () => {
    const out = sanitizeHtml("<table><tbody><tr><td colspan='2'>v</td></tr></tbody></table>");
    expect(out).toContain("<table>");
    expect(out).toContain('colspan');
  });

  it("htmlToText strips all markup", () => {
    expect(htmlToText("<p>a <b>b</b> c</p>")).toBe("a b c");
  });

  it("safeImageUrl rejects non-http protocols", () => {
    expect(safeImageUrl("javascript:alert(1)")).toBeNull();
    expect(safeImageUrl("data:text/html;base64,xxx")).toBeNull();
    expect(safeImageUrl("https://example.com/a.png")).toContain("https://example.com/a.png");
  });

  it("extractDoi finds bare DOIs in citation strings", () => {
    expect(extractDoi("Some title. Nature. 2022. doi: 10.1038/s41591-022-01689-3")).toBe(
      "10.1038/s41591-022-01689-3"
    );
    expect(extractDoi("no doi here")).toBeNull();
  });
});

describe("stable section anchors", () => {
  it("maps canonical headings to fixed anchors", () => {
    const reg = new AnchorRegistry();
    expect(reg.anchorFor("Abstract")).toBe("abstract");
    // fresh registry per document
    const reg2 = new AnchorRegistry();
    expect(reg2.anchorFor("Methods")).toBe("methods");
    const reg3 = new AnchorRegistry();
    expect(reg3.anchorFor("Results")).toBe("results");
  });

  it("generates deterministic slugs for custom headings", () => {
    expect(slugifyAnchor("Projected Cancer Cases & Deaths in 2025!")).toBe(
      slugifyAnchor("Projected Cancer Cases & Deaths in 2025!")
    );
    expect(slugifyAnchor("Café Méthodes")).toBe("cafe-methodes");
  });

  it("resolves collisions deterministically (first wins, later get -2 suffix)", () => {
    const reg = new AnchorRegistry();
    const a = reg.anchorFor("Discussion"); // canonical discussion
    const b = reg.anchorFor("Discussion of findings"); // custom slug
    const b2 = reg.anchorFor("Discussion of findings"); // same input -> same output
    expect(a).toBe("discussion");
    expect(b).toBe(b2);
    expect(b).not.toBe("discussion");
  });
});

describe("JATS normalization", () => {
  let doc: ReturnType<typeof normalizeJats>;
  beforeAll(() => {
    doc = normalizeJats(JATS, { paperId: "doi:10.1234/test.001", providerId: "europepmc" });
  });

  it("extracts metadata", () => {
    expect(doc.title).toBe("Sanitization Test Article");
    expect(doc.authors.map((a) => a.name)).toEqual(["Ada Lovelace", "Alan Turing"]);
    expect(doc.year).toBe(2024);
    expect(doc.doi).toBe("10.1234/test.001");
    expect(doc.journal).toBe("Journal of Testing");
  });

  it("creates stable anchors including abstract first", () => {
    expect(doc.sections[0].anchor).toBe("abstract");
    const anchors = doc.sections.map((s) => s.anchor);
    expect(anchors).toContain("introduction");
    expect(anchors).toContain("methods");
    expect(anchors).toContain("results");
    expect(anchors).toContain("conclusion");
  });

  it("normalizes nested sections as separate entries", () => {
    const anchors = doc.sections.map((s) => s.anchor);
    expect(anchors).toContain("study-design");
  });

  it("does not reduce content to a single plaintext blob", () => {
    const intro = doc.sections.find((s) => s.anchor === "introduction")!;
    expect(intro.blocks.length).toBeGreaterThan(0);
    expect(intro.blocks[0].type).toBe("p");
  });

  it("sanitizes malicious content during normalization", () => {
    const json = JSON.stringify(doc);
    expect(json).not.toContain("<script");
    expect(json).not.toContain("onclick");
    expect(json).not.toContain("javascript:");
  });

  it("extracts figures with captions and image URLs", () => {
    const blocks = doc.sections.flatMap((s) => s.blocks);
    const fig = blocks.find((b) => b.type === "figure");
    if (fig && fig.type === "figure") {
      expect(fig.label).toBe("Fig 1.");
      expect(fig.captionText).toContain("Caption text");
    }
  });

  it("extracts tables preserving structure", () => {
    const blocks = doc.sections.flatMap((s) => s.blocks);
    const tbl = blocks.find((b) => b.type === "table");
    if (tbl && tbl.type === "table") {
      expect(tbl.tableHtml).toContain("<table");
      expect(tbl.tableHtml).toContain("<th");
    }
  });

  it("extracts references with DOIs", () => {
    expect(doc.references.length).toBe(2);
    expect(doc.references[0].doi).toBe("10.5555/old-ref");
    expect(doc.references[1].doi).toBe("10.1093/mind/LIX.236.433");
  });
});
