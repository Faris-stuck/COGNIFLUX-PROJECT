/**
 * Integration tests: Phase 6 Scientific Reader against a running dev server.
 * Requires BASE_URL (default http://localhost:3100).
 * Conventions follow tests/phase1-auth-library.test.ts: real HTTP, unique
 * X-Forwarded-For per client, manual cookie jar.
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3100";

// Module scope marker: without an export/import, tsc treats this file as a
// global script and merges it with other script files (duplicate decls).
export {};

interface EduClient {
  email?: string;
  password?: string;
  cookie?: string;
  ip?: string;
}

async function api(client: EduClient, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (client.cookie) headers.set("cookie", client.cookie);
  if (init.body) headers.set("content-type", "application/json");
  if (client.ip) headers.set("x-forwarded-for", client.ip);
  return fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
}

function takeSession(res: Response): string | undefined {
  const setCookie = res.headers.get("set-cookie") ?? "";
  const m = setCookie.match(/cf_session=[^;]+/);
  return m ? m[0] : undefined;
}

function randInt(): number {
  return 1 + Math.floor(Math.random() * 253);
}

async function registerClient(): Promise<EduClient> {
  const c: EduClient = {
  email: `phase6-test+${Date.now()}-${Math.random().toString(36).slice(2)}@cogniflux.test`,
  password: `Testpass123!`,
  ip: `${randInt()}.${randInt()}.${randInt()}.${randInt()}`,
  };
  const res = await api(c, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email: c.email, password: c.password }),
  });
  if (!res.ok) throw new Error(`register failed: ${res.status} ${await res.text()}`);
  c.cookie = takeSession(res);
  if (!c.cookie) throw new Error("no session cookie after register");
  return c;
}

// Known open-access paper with full text in Europe PMC (cached in Redis by
// earlier live verification; falls back to a live fetch if evicted).
const OA_DOI_ENC = "doi%3A10.3322%2Fcaac.21871";
const OA_PAPER_KEY = "doi:10.3322/caac.21871";
const NO_FT_DOI = "doi:10.9999/cogniflux-nonexistent-test";

describe("Reader full-text API", () => {
  it("reports availability via /fulltext/status", async () => {
    const res = await fetch(`${BASE}/api/papers/${OA_DOI_ENC}/fulltext/status`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.available).toBe(true);
  }, 60_000);

  it("returns a normalized document with sections, references, no scripts", async () => {
    const res = await fetch(`${BASE}/api/papers/${OA_DOI_ENC}/fulltext`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.available).toBe(true);
    expect(data.document.sections.length).toBeGreaterThan(3);
    expect(data.document.references.length).toBeGreaterThan(0);
    expect(data.document.title).toBeTruthy();
    const serialized = JSON.stringify(data.document);
    expect(serialized).not.toContain("<script");
    expect(serialized).not.toContain("onclick");
    expect(serialized).not.toContain("javascript:");
  }, 90_000);

  it("honestly reports unavailable full text for unknown papers", async () => {
    const res = await fetch(`${BASE}/api/papers/${encodeURIComponent(NO_FT_DOI)}/fulltext`);
    expect([200, 404]).toContain(res.status);
    const data = await res.json();
    expect(data.available).toBe(false);
    expect(String(data.message)).toMatch(/Full text isn't available in Cogniflux/i);
  }, 60_000);

  it("renders the Reader page with section anchors", async () => {
    const res = await fetch(`${BASE}/read/${OA_DOI_ENC}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("data-anchor");
    expect(["contents", "daftar isi"].some((x) => html.toLowerCase().includes(x))).toBe(true);
  }, 90_000);
});

describe("Guest vs authenticated reader features", () => {
  it("rejects guest highlight creation with 401", async () => {
    const res = await api({}, "/api/highlights", {
      method: "POST",
      body: JSON.stringify({ paperKey: OA_PAPER_KEY, text: "guest attempt", sectionAnchor: "abstract" }),
    });
    expect(res.status).toBe(401);
  });

  it("authenticated user can create + restore highlights and notes", async () => {
    const c = await registerClient();

    // Highlight
    const hlRes = await api(c, "/api/highlights", {
      method: "POST",
      body: JSON.stringify({
        paperKey: OA_PAPER_KEY,
        text: `Integration test highlight ${Date.now()}`,
        sectionAnchor: "introduction",
      }),
    });
    expect(hlRes.status).toBe(201);

    // Note (same endpoint, note field)
    const noteText = `Integration note ${Date.now()}`;
    const noteRes = await api(c, "/api/highlights", {
      method: "POST",
      body: JSON.stringify({
        paperKey: OA_PAPER_KEY,
        text: "Passage referenced by the note",
        sectionAnchor: "methods",
        note: noteText,
      }),
    });
    expect(noteRes.status).toBe(201);

    // Restore both on reload
    const list = await api(c, `/api/highlights?paperKey=${encodeURIComponent(OA_PAPER_KEY)}`);
    expect(list.status).toBe(200);
    const items = (await list.json()).items ?? [];
    const texts = items.map((i: { text?: string }) => i.text ?? "");
    expect(texts.some((t: string) => t.startsWith("Integration test highlight"))).toBe(true);
    const noted = items.find((i: { note?: string }) => i.note === noteText);
    expect(noted).toBeTruthy();
  });

  it("reading progress persists via history", async () => {
    const c = await registerClient();
    const post = await api(c, "/api/history", {
      method: "POST",
      body: JSON.stringify({
        paperKey: OA_PAPER_KEY,
        progress: 42,
        work: { title: "Cancer statistics, 2025", authors: [{ name: "R. Siegel" }], publicationYear: 2025 },
      }),
    });
    expect(post.ok).toBe(true);
    const list = await api(c, "/api/history");
    expect(list.status).toBe(200);
    const data = await list.json();
    const items = data.items ?? data.history ?? [];
    const entry = items.find((i: { paperKey?: string; progress?: number }) => i.paperKey === OA_PAPER_KEY);
    expect(entry).toBeTruthy();
    expect(entry.progress).toBeGreaterThanOrEqual(40);
  });

  it("library save still works for reader papers (regression)", async () => {
    const c = await registerClient();
    const save = await api(c, "/api/library", {
      method: "POST",
      body: JSON.stringify({
        paperKey: OA_PAPER_KEY,
        work: {
          title: "Cancer statistics, 2025",
          authors: [{ name: "R. Siegel" }],
          publicationYear: 2025,
          doi: "10.3322/caac.21871",
          openAccess: { isOa: true },
        },
      }),
    });
    expect([200, 201, 409]).toContain(save.status);
  });
});

describe("Regression guards", () => {
  it("academic search still works", async () => {
    const res = await fetch(`${BASE}/api/search?q=cancer`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.data?.works ?? data.works)).toBe(true);
  }, 60_000);

  it("search result DOI resolves to paper detail", async () => {
    const search = await fetch(`${BASE}/api/search?q=machine%20learning&perPage=1`);
    expect(search.status).toBe(200);
    const data = await search.json();
    const works = data.data?.works ?? data.works;
    expect(Array.isArray(works)).toBe(true);
    expect(works.length).toBeGreaterThan(0);
    const id = works[0].id as string;
    expect(id.startsWith("doi:")).toBe(true);

    const detail = await fetch(`${BASE}/api/papers/${encodeURIComponent(id)}`);
    expect(detail.status).toBe(200);
    const work = await detail.json();
    expect(work.id).toBe(id);
    expect(typeof work.title).toBe("string");
  }, 60_000);

  it("paper detail page still renders", async () => {
    const res = await fetch(`${BASE}/paper/${encodeURIComponent(OA_PAPER_KEY)}`);
    expect(res.status).toBe(200);
  }, 60_000);
});
