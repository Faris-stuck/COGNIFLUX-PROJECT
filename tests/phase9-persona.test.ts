/**
 * Phase 9 unit tests — persona layer pure logic.
 * DB/Redis are mocked; we assert normalization, cache-key determinism,
 * register mapping, and the ask prompt register injection.
 */
jest.mock("@/lib/db", () => ({
  getPool: () => ({ query: jest.fn() }),
  getRedis: async () => ({ del: jest.fn() }),
  cached: async <T,>(_k: string, _ttl: number, fn: () => Promise<T>) => fn(),
}));

import {
  normalizeInterests,
  feedCacheKey,
  registerInstruction,
  forYouFeed,
} from "@/lib/persona";
import { buildMessages } from "@/lib/ask";

jest.mock("@/lib/providers/orchestrator", () => ({
  getOrchestrator: () => ({
    search: jest.fn(async () => ({ works: [], providersFailed: [] })),
  }),
}));

describe("Phase 9 unit: normalizeInterests", () => {
  test("trims, lowercases, dedupes, caps at 10, drops empties", () => {
    const raw = ["  AI ", "ai", "climate", "", "  ", ...Array.from({ length: 12 }, (_, i) => `t${i}`)];
    const out = normalizeInterests(raw);
    expect(out[0]).toBe("ai");
    expect(out.filter((x) => x === "ai")).toHaveLength(1);
    expect(out).toHaveLength(10);
  });
  test("caps each interest at 50 chars", () => {
    expect(normalizeInterests(["x".repeat(80)])[0]).toHaveLength(50);
  });
});

describe("Phase 9 unit: feed cache key", () => {
  test("same set same key, different set different key", () => {
    expect(feedCacheKey(["ai", "bio"])).toBe(feedCacheKey(["ai", "bio"]));
    expect(feedCacheKey(["ai", "bio"])).not.toBe(feedCacheKey(["bio", "ai"]));
    expect(feedCacheKey(["ai"])).toMatch(/^cf:foryou:[0-9a-f]{16}$/);
  });
});

describe("Phase 9 unit: registerInstruction", () => {
  test("younger levels get simplified register", () => {
    expect(registerInstruction("elementary")).toMatch(/school child/i);
    expect(registerInstruction("high")).toMatch(/avoid jargon/i);
    expect(registerInstruction("researcher")).toMatch(/technical/i);
    expect(registerInstruction(null)).toBeNull();
  });
});

describe("Phase 9 unit: forYouFeed guardrails", () => {
  test("empty interests -> [] without hitting the orchestrator", async () => {
    const { getOrchestrator } = require("@/lib/providers/orchestrator");
    const before = getOrchestrator().search.mock.calls.length;
    expect(await forYouFeed([])).toEqual([]);
    expect(getOrchestrator().search.mock.calls.length).toBe(before);
  });
  test("upstream empty -> [] (never throws)", async () => {
    expect(await forYouFeed(["quantum computing"])).toEqual([]);
  });
});

describe("Phase 9 unit: ask prompt register injection", () => {
  test("register appended to system prompt when provided", () => {
    const msgs = buildMessages("q", "ctx", "id", registerInstruction("high"));
    expect(msgs[0].content).toMatch(/avoid jargon/i);
  });
  test("no register -> identical to Phase 8 prompt (regression)", () => {
    const a = buildMessages("q", "ctx", "id");
    const b = buildMessages("q", "ctx", "id", registerInstruction(null));
    expect(a[0].content).toBe(b[0].content);
    expect(a[0].content.endsWith("Keep it under 200 words.")).toBe(true);
  });
});
