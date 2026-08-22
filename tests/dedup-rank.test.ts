import { dedupeWorks, rankWorks } from "@/lib/providers/orchestrator";
import { normalizeOpenAlex } from "@/lib/providers/openalex";
import { normalizeCrossref } from "@/lib/providers/crossref";
import { WorkSchema, type Work } from "@/lib/types";

function mk(partial: Partial<Work>): Work {
  return WorkSchema.parse({
    id: partial.id ?? "x:1",
    title: partial.title ?? "Untitled",
    source: partial.source ?? "test",
    // mirror real normalizers: sources always contains at least the origin provider
    sources: partial.sources ?? [partial.source ?? "test"],
    ...partial,
  });
}

describe("dedupeWorks", () => {
  it("merges same DOI from different providers into one", () => {
    const a = mk({ id: "doi:10.1000/abc", doi: "10.1000/abc", title: "A Study", source: "openalex", abstract: null });
    const b = mk({ id: "crossref:10.1000/abc", doi: "10.1000/abc", title: "A Study", source: "crossref", abstract: "Has abstract" });
    const out = dedupeWorks([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].sources.sort()).toEqual(["crossref", "openalex"]);
    expect(out[0].abstract).toBe("Has abstract");
  });

  it("merges same normalized title+year when DOI missing", () => {
    const a = mk({ id: "p1", title: "Impact of  AI on Education!", publicationYear: 2023, source: "openalex" });
    const b = mk({ id: "p2", title: "impact of ai on education", publicationYear: 2023, source: "crossref" });
    const out = dedupeWorks([a, b]);
    expect(out).toHaveLength(1);
  });

  it("keeps distinct papers separate", () => {
    const a = mk({ id: "1", title: "Paper One", publicationYear: 2020 });
    const b = mk({ id: "2", title: "Paper Two", publicationYear: 2021 });
    expect(dedupeWorks([a, b])).toHaveLength(2);
  });
});

describe("rankWorks", () => {
  it("does not bury recent papers below highly cited old ones for a matching query", () => {
    const old = mk({ id: "old", title: "machine learning survey", citationCount: 5000, publicationYear: 2005 });
    const recent = mk({ id: "new", title: "machine learning for climate", citationCount: 3, publicationYear: 2026 });
    const out = rankWorks([old, recent], "machine learning climate");
    expect(out[0].id).toBe("new");
  });

  it("ranks query coverage above citation count", () => {
    const offTopic = mk({ id: "off", title: "quantum computing", citationCount: 900 });
    const onTopic = mk({ id: "on", title: "education and AI", citationCount: 10 });
    const out = rankWorks([offTopic, onTopic], "education AI");
    expect(out[0].id).toBe("on");
  });
});

describe("normalizers", () => {
  it("rebuilds OpenAlex inverted-index abstract", () => {
    const work = normalizeOpenAlex({
      id: "https://openalex.org/W123",
      doi: "https://doi.org/10.1000/x",
      display_name: "Test",
      abstract_inverted_index: { Hello: [0], world: [1] },
    });
    expect(work.abstract).toBe("Hello world");
    expect(work.doi).toBe("10.1000/x");
  });

  it("strips JATS tags from Crossref abstract and maps fields", () => {
    const work = normalizeCrossref({
      DOI: "10.5555/T1",
      title: ["Crossref Paper"],
      abstract: "<jats:p>Clean text.</jats:p>",
      issued: { "date-parts": [[2022]] },
      "container-title": ["Journal of Tests"],
      type: "journal-article",
      author: [{ given: "Budi", family: "Santoso" }],
    });
    expect(work).not.toBeNull();
    expect(work!.abstract).toBe("Clean text.");
    expect(work!.publicationYear).toBe(2022);
    expect(work!.type).toBe("article");
    expect(work!.authors[0].name).toBe("Budi Santoso");
  });
});
