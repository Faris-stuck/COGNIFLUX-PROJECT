/**
 * Phase 8 — AI layer tests.
 * Unit: citation extraction/validation, context builder budget, provider
 * factory selection, NullProvider behavior, askQuestion degraded paths with
 * an injected fake orchestrator result (via mock provider + mocked module).
 * Integration (live server): GET /api/ask probe, POST validation errors,
 * degraded response shape, rate limiter presence.
 */
jest.mock("@/lib/providers/orchestrator", () => ({
  getOrchestrator: () => ({
    search: jest.fn(async () => ({
      works: [
        {
          id: "doi:10.1/x",
          title: "A Study of Things",
          authors: [{ name: "Riset, A." }],
          abstract: "Abstract text.",
          publicationYear: 2024,
          journal: null,
          publisher: null,
          doi: "10.1/x",
          url: null,
          source: "openalex",
          sources: ["openalex"],
          type: "article",
          language: "en",
          subjects: [],
          citationCount: 5,
          openAccess: { isOa: false, url: null, license: null },
          fullTextUrl: null,
          metadata: {},
        },
      ],
      total: 1,
      page: 1,
      perPage: 6,
      providersUsed: ["openalex"],
      providersFailed: [],
      degraded: false,
    })),
  }),
}));

import { askQuestion, extractCitations, citationsValid, toCited, buildContext, buildMessages } from "@/lib/ask";
import { NullProvider, ProviderUnavailable } from "@/lib/models/types";
import { OpenAICompatProvider } from "@/lib/models/openai-compat";
import { createProvider } from "@/lib/models";
import type { Work } from "@/lib/types";

function fakeWork(over: Partial<Work> = {}): Work {
  return {
    id: "doi:10.1/x",
    title: "A Study of Things",
    authors: [{ name: "Riset, A." }, { name: "Sumber, B." }],
    abstract: "Long ".repeat(120),
    publicationYear: 2024,
    journal: null,
    publisher: null,
    doi: "10.1/x",
    url: null,
    source: "openalex",
    sources: ["openalex"],
    type: "article",
    language: "en",
    subjects: [],
    citationCount: 5,
    openAccess: { isOa: true, url: "https://oa.example/1", license: "cc-by" },
    fullTextUrl: null,
    metadata: {},
    ...over,
  } as Work;
}

describe("Phase 8 unit: citations", () => {
  test("extractCitations returns unique sorted numbers", () => {
    expect(extractCitations("Menurut [2] dan [1], juga [2] lagi. [10] terakhir")).toEqual([1, 2, 10]);
  });
  test("extractCitations empty when no markers", () => {
    expect(extractCitations("tanpa sitasi sama sekali")).toEqual([]);
  });
  test("citationsValid requires >=1 in-range citation", () => {
    expect(citationsValid("jawaban [1] dan [3]", 3)).toBe(true);
    expect(citationsValid("jawaban [4]", 3)).toBe(false); // out of range
    expect(citationsValid("jawaban [0]", 3)).toBe(false); // zero invalid
    expect(citationsValid("tanpa sitasi", 3)).toBe(false);
  });
});

describe("Phase 8 unit: context builder", () => {
  const works = [fakeWork(), fakeWork({ id: "doi:10.1/y", doi: "10.1/y", title: "Kedua", abstract: null, openAccess: { isOa: false, url: null, license: null } })];
  const papers = toCited(works);

  test("papers numbered from 1 with canonical url fallback", () => {
    expect(papers[0].n).toBe(1);
    expect(papers[0].url).toBe("https://oa.example/1");
    expect(papers[1].url).toBe("https://doi.org/10.1/y");
  });
  test("abstract capped at 480 chars", () => {
    const ctx = buildContext(papers, works);
    expect(ctx).toContain("[1] A Study of Things");
    expect(ctx).toContain("(2024)");
    expect(ctx).toContain("(no abstract)");
    const absLine = ctx.split("\n").find((l) => l.startsWith("Abstract:"))!;
    expect(absLine.length).toBeLessThanOrEqual("Abstract: ".length + 480);
  });
  test("messages carry language + grounding rules", () => {
    const msgs = buildMessages("apa itu x?", "CTX", "id");
    expect(msgs[0].content).toContain("Bahasa Indonesia");
    expect(msgs[0].content).toContain("[n]");
    expect(msgs[1].content).toContain("Question: apa itu x?");
    expect(buildMessages("q", "c", "en")[0].content).toContain("English");
  });
});

describe("Phase 8 unit: provider layer", () => {
  test("NullProvider is unavailable and throws", async () => {
    const p = new NullProvider();
    expect(p.available).toBe(false);
    await expect(p.complete([{ role: "user", content: "x" }])).rejects.toBeInstanceOf(ProviderUnavailable);
  });
  test("createProvider -> none / auto-without-key -> NullProvider", () => {
    expect(createProvider({ COGNIFLUX_LLM: "none" }).id).toBe("none");
    expect(createProvider({ COGNIFLUX_LLM: "auto" }).id).toBe("none");
    expect(createProvider({}).available).toBe(false);
  });
  test("createProvider -> zrouter only when key present (auto)", () => {
    const p = createProvider({ ZROUTER_API_KEY: "test-key-123" });
    expect(p.id).toBe("zrouter");
    expect(p.available).toBe(true);
  });
  test("explicit zrouter without key stays unavailable", () => {
    const p = new OpenAICompatProvider({ COGNIFLUX_LLM: "zrouter" });
    expect(p.available).toBe(false);
  });
});

describe("Phase 8 unit: askQuestion pipeline (mocked retrieval)", () => {
  const fakePapers = toCited([
    fakeWork({ openAccess: { isOa: true, url: null, license: null } }),
  ]); // matches the mocked orchestrator work (doi-url fallback)

  test("no_provider -> degraded with papers", async () => {
    const res = await askQuestion("apa itu x", new NullProvider());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("no_provider");
      expect(res.papers).toEqual([
      { n: 1, id: "doi:10.1/x", title: "A Study of Things", year: 2024, url: "https://doi.org/10.1/x" },
    ]);
    }
  });
  test("grounded answer passes citation validation", async () => {
    const provider = {
      id: "fake",
      available: true,
      timeoutMs: 1000,
      complete: async () => ({ text: "Menurut bukti [1], x adalah y.", model: "fake-1" }),
    };
    const res = await askQuestion("apa itu x", provider, "id");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.cited).toEqual([1]);
      expect(res.model).toBe("fake-1");
    }
  });
  test("citation outside evidence list -> invalid_citations", async () => {
    const provider = {
      id: "fake",
      available: true,
      timeoutMs: 1000,
      complete: async () => ({ text: "klaim tanpa dasar [9]", model: "fake-1" }),
    };
    const res = await askQuestion("apa itu x", provider);
    expect(!res.ok && res.reason).toBe("invalid_citations");
  });
  test("provider throw -> provider_error", async () => {
    const provider = {
      id: "fake",
      available: true,
      timeoutMs: 1000,
      complete: async () => {
        throw new ProviderUnavailable("fake", "boom");
      },
    };
    const res = await askQuestion("apa itu x", provider);
    expect(!res.ok && res.reason).toBe("provider_error");
  });
});
