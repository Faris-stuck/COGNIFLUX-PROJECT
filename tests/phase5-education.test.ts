/**
 * Phase 5 unit tests — education classifier, dedup, ranking, normalization.
 * Pure logic only: no network, no Redis.
 */
import { classifyQuery } from "@/lib/education/classifier";
import { dedupeEducationResources, rankEducationResources } from "@/lib/education/orchestrator";
import { normalizeSubject } from "@/lib/education/types";
import type { EducationResource } from "@/lib/education/types";

function mkResource(over: Partial<EducationResource>): EducationResource {
  return {
    id: "edu:test:1",
    title: "Test Resource",
    description: null,
    authors: [],
    publisher: null,
    year: 2023,
    language: "en",
    educationLevel: ["university"],
    grade: null,
    subject: [],
    topic: null,
    resourceType: "textbook",
    format: ["web"],
    source: "test",
    sourceId: "1",
    sourceUrl: null,
    readUrl: null,
    license: null,
    updatedAt: null,
    thumbnail: null,
    metadata: {},
    sources: ["test"],
    ...over,
  };
}

describe("education query classification", () => {
  it("classifies English level+subject query", () => {
    const c = classifyQuery("grade 8 mathematics");
    expect(c.domain).toBe("education");
    expect(c.levels).toEqual(["middle-school"]);
    expect(c.grade).toBe(8);
    expect(c.subjects).toContain("mathematics");
    expect(c.lang).toBe("en");
  });

  it("classifies Indonesian query with kelas", () => {
    const c = classifyQuery("matematika kelas 8");
    expect(c.domain).toBe("education");
    expect(c.levels).toContain("middle-school");
    expect(c.grade).toBe(8);
    expect(c.subjects).toContain("mathematics");
    expect(c.lang).toBe("id");
  });

  it("classifies SMK RPL as vocational programming", () => {
    const c = classifyQuery("SMK RPL database");
    expect(c.levels).toContain("vocational");
    // RPL = Rekayasa Perangkat Lunak -> software/programming
    expect(c.subjects).toContain("programming");
    expect(c.topicTerms.join(" ").toLowerCase()).toContain("database");
  });

  it("treats research queries as academic", () => {
    const c = classifyQuery("machine learning research");
    expect(c.domain).toBe("academic");
  });

  it("detects mixed intent for education+research", () => {
    const c = classifyQuery("AI in vocational education research");
    expect(c.domain).toBe("both");
  });

  it("detects textbook keyword", () => {
    const c = classifyQuery("high school biology textbook");
    expect(c.domain).not.toBe("academic");
    expect(c.levels).toContain("high-school");
    expect(c.subjects).toContain("biology");
  });

  it("maps SD/SMA/SMK Indonesian levels", () => {
    expect(classifyQuery("buku IPA SD").levels).toContain("elementary");
    expect(classifyQuery("fisika SMA").levels).toContain("high-school");
    expect(classifyQuery("kelistrikan SMK").levels).toContain("vocational");
  });

  // Regression grid: grade <-> level mapping must be single-valued and
  // consistent across languages.
  it.each([
    ["grade 5 mathematics", "elementary"],
    ["grade 8 mathematics", "middle-school"],
    ["grade 12 mathematics", "high-school"],
    ["kelas 5 matematika", "elementary"],
    ["kelas 8 matematika", "middle-school"],
    ["kelas 12 matematika", "high-school"],
  ])("%s -> %s (exactly one level)", (query, expected) => {
    const c = classifyQuery(query);
    expect(c.levels).toEqual([expected]);
  });

  it.each([5, 8, 12])("grade %i is extracted in both languages", (g) => {
    expect(classifyQuery(`grade ${g} physics`).grade).toBe(g);
    expect(classifyQuery(`fisika kelas ${g}`).grade).toBe(g);
  });

  it("SMK RPL alone maps to vocational + programming", () => {
    const c = classifyQuery("SMK RPL");
    expect(c.levels).toContain("vocational");
    expect(c.subjects).toContain("programming");
  });

  // Academic compound terms must never be pulled into education by the bare
  // word "learning".
  it("machine learning queries stay academic", () => {
    expect(classifyQuery("machine learning").domain).toBe("academic");
    expect(classifyQuery("machine learning research").domain).toBe("academic");
    expect(classifyQuery("deep learning").domain).toBe("academic");
  });

  it("learning materials with explicit grade is education", () => {
    const c = classifyQuery("learning materials for grade 8");
    expect(["education", "both"]).toContain(c.domain);
    expect(c.grade).toBe(8);
  });

  it("AI education research resolves via explicit intent logic", () => {
    const c = classifyQuery("AI education research");
    // explicit education word + research marker -> both per conflict rules
    expect(c.domain).toBe("both");
  });

  it("AI in vocational education keeps explicit level, education intent", () => {
    const c = classifyQuery("AI in vocational education");
    expect(c.levels).toContain("vocational");
    // No academic marker present -> education wins; "AI" alone is not research.
    expect(c.domain).toBe("education");
  });
});

describe("subject normalization", () => {
  it("normalizes synonyms across languages", () => {
    expect(normalizeSubject("Calculus")).toBe("mathematics");
    expect(normalizeSubject("matematika")).toBe("mathematics");
    expect(normalizeSubject("Computer Science")).toBe("computer-science");
    expect(normalizeSubject("sejarah")).toBe("history");
  });
});

describe("education deduplication", () => {
  it("merges by ISBN13 into one canonical resource with multiple sources", () => {
    const a = mkResource({ id: "edu:a:1", source: "a", sources: ["a"], metadata: { isbn13: "978-1-111-11111-1" } });
    const b = mkResource({ id: "edu:b:2", source: "b", sources: ["b"], metadata: { isbn13: "9781111111111" } });
    const out = dedupeEducationResources([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].sources.sort()).toEqual(["a", "b"]);
  });

  it("merges by canonical URL when no ISBN", () => {
    const a = mkResource({ id: "edu:a:1", source: "a", sources: ["a"], readUrl: "https://example.com/book/" });
    const b = mkResource({ id: "edu:b:2", source: "b", sources: ["b"], readUrl: "https://example.com/book" });
    const out = dedupeEducationResources([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].sources.length).toBe(2);
  });

  it("merges by normalized title + year as last resort and fills missing fields", () => {
    const a = mkResource({ id: "edu:a:1", source: "a", sources: ["a"], title: "College Physics!", year: 2020, description: null });
    const b = mkResource({
      id: "edu:b:2",
      source: "b",
      sources: ["b"],
      title: "college physics",
      year: 2020,
      description: "A physics text.",
    });
    const out = dedupeEducationResources([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].description).toBe("A physics text.");
  });

  it("keeps distinct resources separate", () => {
    const a = mkResource({ id: "edu:a:1", title: "Algebra Basics", year: 2019 });
    const b = mkResource({ id: "edu:b:2", title: "Organic Chemistry", year: 2021 });
    expect(dedupeEducationResources([a, b])).toHaveLength(2);
  });
});

const baseParams = (over: Record<string, unknown> = {}) => ({
  q: "",
  page: 1,
  perPage: 10,
  level: [] as never[],
  grade: undefined as number | undefined,
  subject: [] as string[],
  language: [] as string[],
  resourceType: [] as never[],
  format: [] as string[],
  provider: [] as string[],
  yearFrom: undefined,
  yearTo: undefined,
  ...over,
});

describe("education ranking", () => {
  it("ranks exact grade match above university resource for grade-8 query", () => {
    const params = baseParams({ q: "grade 8 physics", grade: 8 });
    const grade8 = mkResource({
      id: "edu:g8",
      title: "Physics: Middle School Motion",
      educationLevel: ["middle-school"],
      grade: 8,
      subject: ["physics"],
      year: 2024,
    });
    const uni = mkResource({
      id: "edu:uni",
      title: "University Physics",
      educationLevel: ["university"],
      grade: null,
      subject: ["physics"],
    });
    const ranked = rankEducationResources([uni, grade8], params);
    expect(ranked[0].id).toBe("edu:g8");
  });

  it("prefers level matches from explicit filters", () => {
    const params = baseParams({ level: ["vocational" as never] });
    const voc = mkResource({ id: "edu:voc", educationLevel: ["vocational"], title: "Automotive Systems" });
    const uni = mkResource({ id: "edu:uni", educationLevel: ["university"], title: "Thermodynamics" });
    const ranked = rankEducationResources([uni, voc], params);
    expect(ranked[0].id).toBe("edu:voc");
  });
});
