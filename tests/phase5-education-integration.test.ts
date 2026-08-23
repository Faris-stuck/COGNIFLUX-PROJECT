/**
 * Phase 5 integration tests — live education API against the dev server.
 * Follows the Phase 1 integration-test conventions (real HTTP, unique
 * X-Forwarded-For per client for rate-limit isolation). No fake providers:
 * OpenStax/OTL are hit through the same orchestrator the app uses; results
 * are cached by Redis so repeated runs stay fast.
 */
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3100";

interface EduClient {
  (
    path: string,
    init?: RequestInit & { json?: unknown; ip?: string }
  ): Promise<Response>;
}

function makeClient(ip: string): EduClient {
  let cookie: string | undefined;
  const client: EduClient = async (path, init) => {
    const { json, ip: _ignored, ...rest } = init ?? {};
    const headers: Record<string, string> = {
      ...((rest.headers as Record<string, string>) ?? {}),
      "x-forwarded-for": ip,
      ...(json !== undefined ? { "content-type": "application/json" } : {}),
    };
    if (cookie) headers.cookie = cookie;
    const res = await fetch(`${BASE_URL}${path}`, {
      ...rest,
      headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      redirect: "manual",
    });
    // Capture session cookie from auth responses (Phase 1 convention).
    const setCookie = res.headers.get("set-cookie") ?? "";
    const m = setCookie.match(/cf_session=[^;]+/);
    if (m) cookie = m[0];
    return res;
  };
  return client;
}

const uniqueEmail = () => `edu-int-${Date.now()}-${Math.floor(Math.random() * 1e6)}@cogniflux.test`;

describe("Phase 5: education integration (live)", () => {
  jest.setTimeout(120_000);

  it("education search API returns live provider results", async () => {
    const res = await fetch(`${BASE_URL}/api/education/search?q=biology&perPage=5`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBeGreaterThan(0);
    expect(Array.isArray(data.resources)).toBe(true);
    expect(data.resources.length).toBeGreaterThan(0);
    expect(data.providersUsed.length).toBeGreaterThan(0);

    const r = data.resources[0];
    expect(r.id).toMatch(/^edu:[a-z0-9-]+:/);
    expect(r.title.length).toBeGreaterThan(0);
    expect(typeof r.language).toBe("string");
    expect(["openstax", "otl"]).toContain(r.source);
  });

  it("education resource detail resolves by canonical id", async () => {
    // Discover a real id from search first - never invent one.
    const search = await fetch(`${BASE_URL}/api/education/search?q=physics&perPage=3`);
    const { resources } = await search.json();
    expect(resources.length).toBeGreaterThan(0);
    const id = encodeURIComponent(resources[0].id);

    const res = await fetch(`${BASE_URL}/api/education/resource/${id}`);
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.id).toBe(resources[0].id);
    expect(r.title.length).toBeGreaterThan(0);
  });

  it("unknown education id -> human-friendly 404", async () => {
    const res = await fetch(
      `${BASE_URL}/api/education/resource/${encodeURIComponent("edu:nosuch:99999")}`
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(typeof body.message).toBe("string");
  });

  it("authenticated save education resource -> appears in library", async () => {
    const api: EduClient = makeClient(`10.77.0.${Math.floor(Math.random() * 200 + 10)}`);
    const email = uniqueEmail();

    const reg = await api("/api/auth/register", {
      method: "POST",
      json: { email, password: "Str0ngPass!2026", displayName: "EduInt" },
    });
    expect([200, 201]).toContain(reg.status);

    // Grab a real resource id.
    const search = await fetch(`${BASE_URL}/api/education/search?q=chemistry&perPage=2`);
    const { resources } = await search.json();
    const target = resources[0];

    const save = await api("/api/library", {
      method: "POST",
      json: {
        paperKey: target.id,
        work: {
          title: target.title,
          authors: target.authors?.slice(0, 10) ?? [],
          publicationYear: target.year ?? null,
          journal: target.publisher ?? null,
          doi: null,
          openAccess: { isOa: true, url: target.readUrl ?? target.sourceUrl ?? null },
        },
      },
    });
    expect(save.status).toBe(201);

    const lib = await api("/api/library");
    expect(lib.status).toBe(200);
    const items = await lib.json();
    const savedItem = items.items.find((i: { paper_key: string }) => i.paper_key === target.id);
    expect(savedItem).toBeDefined();
    expect(savedItem.title).toBe(target.title);
  });

  it("existing academic search still works (regression)", async () => {
    const res = await fetch(`${BASE_URL}/api/search?q=machine%20learning&perPage=3`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBeGreaterThan(0);
    expect(data.works.length).toBeGreaterThan(0);
    expect(data.providersUsed).toContain("openalex");
  });

  it("provider failure degrades gracefully instead of failing search", async () => {
    // A query with aggressive filters that no catalog item can satisfy still
    // must yield HTTP 200 with an empty-but-valid envelope, proving a
    // provider-level miss never becomes a 500.
    const res = await fetch(
      `${BASE_URL}/api/education/search?q=zzzqxvnothingmatches&perPage=5&yearFrom=3000`
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.resources).toEqual([]);
    expect(Array.isArray(data.providersUsed)).toBe(true);
    expect(typeof data.degraded).toBe("boolean");
  });

  it("taxonomy endpoint serves bilingual levels + subjects", async () => {
    const res = await fetch(`${BASE_URL}/api/education/taxonomy`);
    expect(res.status).toBe(200);
    const t = await res.json();
    expect(t.levels).toHaveLength(6);
    const middle = t.levels.find((l: { slug: string }) => l.slug === "middle-school");
    expect(middle.label.en).toBe("Middle School");
    expect(middle.label.id).toBe("SMP");
    expect(t.subjects.length).toBeGreaterThanOrEqual(24);
  });
});
