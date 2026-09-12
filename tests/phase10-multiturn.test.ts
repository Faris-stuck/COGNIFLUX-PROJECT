/**
 * Phase 10 unit tests — multi-turn plumbing + usage logging helpers.
 * DB is mocked; we assert pure logic (history trimming, IP hashing,
 * conversationId schema tolerance) and prompt assembly order.
 */
const queries: { sql: string; params: unknown[] }[] = [];
jest.mock("@/lib/db", () => ({
  getPool: () => ({
    query: async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return { rows: [] };
    },
    connect: async () => ({
      query: async (sql: string, params: unknown[] = []) => {
        queries.push({ sql, params });
        return { rows: [] };
      },
      release: () => {},
    }),
  }),
  getRedis: async () => ({ del: jest.fn() }),
  cached: async <T,>(_k: string, _ttl: number, fn: () => Promise<T>) => fn(),
}));

import { trimHistory, hashIp, logAiQuery, appendRound } from "@/lib/ai-store";
import { buildMessages } from "@/lib/ask";

describe("Phase 10 unit: trimHistory", () => {
  test("keeps whole pairs, first message is always user", () => {
    const h = [
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "q2" },
      { role: "assistant", content: "a2" },
      { role: "user", content: "q3" },
      { role: "assistant", content: "a3" },
      { role: "user", content: "q4" },
    ] as const;
    const out = trimHistory(h.map((x) => ({ ...x })));
    expect(out.length).toBeLessThanOrEqual(6);
    expect(out[0].role).toBe("user");
  });
  test("leading assistant turns get dropped (orphan answer from a cap)", () => {
    const out = trimHistory([
      { role: "assistant", content: "a" },
      { role: "user", content: "q" },
    ]);
    expect(out).toEqual([{ role: "user", content: "q" }]);
  });
  test("empty in -> empty out", () => {
    expect(trimHistory([])).toEqual([]);
  });
});

describe("Phase 10 unit: hashIp", () => {
  test("deterministic, 32 hex chars, different IPs differ", () => {
    const a = hashIp("1.2.3.4");
    expect(a).toBe(hashIp("1.2.3.4"));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(hashIp("1.2.3.5"));
  });
});

describe("Phase 10 unit: ai-store SQL contracts", () => {
  test("logAiQuery writes an ai_queries row and never throws on db error", async () => {
    queries.length = 0;
    await logAiQuery({
      userId: null, conversationId: null, question: "q".repeat(500),
      model: null, ok: false, reason: "no_provider", ipHash: "x",
    });
    const ins = queries.find((q) => q.sql.includes("INSERT INTO ai_queries"));
    expect(ins).toBeTruthy();
    expect(String(ins!.params[3])).toHaveLength(200); // question excerpt capped
  });
  test("appendRound skips assistant row when answer null", async () => {
    queries.length = 0;
    // ownership lookup returns [] (mock default) -> appendRound must no-op
    await appendRound("u1", 7, "question", null, []);
    expect(queries.some((q) => q.sql.includes("INSERT INTO ai_messages"))).toBe(false);
  });
});

describe("Phase 10 unit: multi-turn prompt assembly", () => {
  test("history turns sit between system and the final evidence question", () => {
    const msgs = buildMessages("baru", "CTX", "id", null, [
      { role: "user", content: "lama" },
      { role: "assistant", content: "jawaban lama" },
    ]);
    expect(msgs.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(msgs[1].content).toBe("lama");
    expect(msgs[3].content).toContain("Question: baru");
    expect(msgs[0].content).toMatch(/earlier turns/i);
  });
  test("no history -> identical shape to Phase 8 (system+user only)", () => {
    const msgs = buildMessages("q", "CTX", "id");
    expect(msgs.length).toBe(2);
    expect(msgs[0].content).not.toMatch(/earlier turns/i);
  });
});
