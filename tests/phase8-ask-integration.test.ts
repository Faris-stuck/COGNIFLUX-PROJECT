/**
 * Phase 8 integration — /ask + /api/ask against the running server.
 * Works whether or not the server has a key: never asserts a live LLM
 * answer (nondeterministic + costs tokens); asserts contract + degrade
 * behavior + rate limiting.
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
export {};

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.99" },
    body: JSON.stringify(body),
  });
}

describe("Phase 8 integration: /api/ask", () => {
  test("GET probe reports ai_enabled boolean + provider id", async () => {
    const r = await fetch(`${BASE}/api/ask`, { headers: { "x-forwarded-for": "203.0.113.99" } });
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(typeof data.ai_enabled).toBe("boolean");
    expect(typeof data.provider).toBe("string");
  });

  test("blank question -> 400 invalid_question", async () => {
    const r = await post("/api/ask", { question: "hi" }); // < 5 chars
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("invalid_question");
  });

  test("invalid json -> 400", async () => {
    const r = await fetch(`${BASE}/api/ask`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.99" },
      body: "{nope",
    });
    expect(r.status).toBe(400);
  });

  test("valid question -> 200 with grounded-or-degraded shape", async () => {
    const r = await post("/api/ask", { question: "what do meta-analyses say about sleep and memory consolidation?" });
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(Array.isArray(data.papers)).toBe(true);
    if (data.ok === undefined && data.answer) {
      // answered path: every citation resolves
      expect(Array.isArray(data.cited)).toBe(true);
      expect(data.cited.length).toBeGreaterThan(0);
      for (const n of data.cited) {
        expect(data.papers.some((p: { n: number }) => p.n === n)).toBe(true);
      }
    } else if (data.degraded) {
      expect(["no_provider", "no_results", "provider_error", "invalid_citations"]).toContain(data.reason);
    }
  }, 60000);

  test("rate limiter engages within window", async () => {
    // 13 rapid calls vs limit 12/60s from the same test IP
    const results = await Promise.all(
      Array.from({ length: 13 }, () => post("/api/ask", { question: "sleep memory consolidation meta-analysis" })),
    );
    expect(results.some((r) => r.status === 429)).toBe(true);
    const limited = results.find((r) => r.status === 429)!;
    expect((await limited.json()).error).toBe("rate_limited");
  }, 60000);
});
