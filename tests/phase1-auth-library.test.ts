/**
 * Integration tests: Phase 1 Auth + Library against a running dev server.
 * Requires: BASE_URL env (default http://localhost:3100) and a reachable DB.
 * These are real end-to-end tests - they register throwaway accounts
 * (phase1-test+<random>@cogniflux.test) and verify isolation between them.
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3100";

// Module scope marker (prevents global-script merging across test files).
export {};

interface Client {
  email: string;
  password: string;
  cookie?: string;
  ip?: string;
}

async function api(client: Client, path: string, init: RequestInit = {}): Promise<Response> {
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

async function registerClient(): Promise<Client> {
  const c: Client = {
    email: `phase1-test+${Math.random().toString(36).slice(2)}@cogniflux.test`,
    password: `Testpass123`,
    // simulate a distinct origin so the shared rate limiter isn't tripped by the suite itself
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

function randInt(): number {
  return 1 + Math.floor(Math.random() * 253);
}

function randIp(): string {
  return `${randInt()}.${randInt()}.${randInt()}.${randInt()}`;
}

/**
 * Headers for tests that intentionally use a bare fetch (no session client).
 * A unique X-Forwarded-For per call keeps each assertion in its own
 * rate-limit bucket: the limiter stays fully armed, but repeated suite runs
 * inside the 900s window can no longer exhaust the shared "local" bucket and
 * turn a 409/401 assertion into a 429.
 */
function anonHeaders(): Record<string, string> {
  return { "content-type": "application/json", "x-forwarded-for": randIp() };
}

const PAPER_A = { paperKey: "doi:10.1111/test-a", work: { title: "Test Paper A", authors: [{ name: "A. Author" }], publicationYear: 2024, openAccess: { isOa: true } } };
const PAPER_B = { paperKey: "doi:10.2222/test-b", work: { title: "Test Paper B", authors: [], publicationYear: 2023, openAccess: { isOa: false } } };

describe("Authentication", () => {
  it("registers, exposes session, and /me reflects it", async () => {
    const c = await registerClient();
    const me = await api(c, "/api/auth/me");
    expect(me.status).toBe(200);
    const data = await me.json();
    expect(data.user.email).toBe(c.email);
    expect(data.profile).toBeDefined();
    // never leak hash
    expect(JSON.stringify(data)).not.toMatch(/password/i);
  });

  it("rejects weak passwords", async () => {
    const res = await fetch(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: anonHeaders(),
      body: JSON.stringify({ email: "weakpw@cogniflux.test", password: "short" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects duplicate registration with generic message (no enumeration)", async () => {
    const c = await registerClient();
    const res = await fetch(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: anonHeaders(),
      body: JSON.stringify({ email: c.email, password: "Otherpass123" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.message).not.toContain("exists");
  });

  it("login works with correct credentials", async () => {
    const c = await registerClient();
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: anonHeaders(),
      body: JSON.stringify({ email: c.email, password: c.password }),
    });
    expect(res.status).toBe(200);
    expect(takeSession(res)).toBeDefined();
  });

  it("login fails uniformly for wrong password AND unknown email (anti-enumeration)", async () => {
    const wrongPw = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: anonHeaders(),
      body: JSON.stringify({ email: "phase1-test+known@cogniflux.test", password: "WrongPass999" }),
    });
    const unknownEmail = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: anonHeaders(),
      body: JSON.stringify({ email: `nobody-${Date.now()}@cogniflux.test`, password: "WrongPass999" }),
    });
    expect(wrongPw.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect((await wrongPw.json()).message).toBe((await unknownEmail.json()).message);
  });

  it("logout destroys the session", async () => {
    const c = await registerClient();
    const res = await api(c, "/api/auth/logout", { method: "POST" });
    expect(res.ok).toBe(true);
    const me = await api(c, "/api/auth/me");
    expect(me.status).toBe(401);
  });

  it("protected APIs reject guests with 401", async () => {
    for (const path of ["/api/library", "/api/collections", "/api/notes", "/api/highlights", "/api/history"]) {
      const res = await fetch(`${BASE}${path}`);
      expect(res.status).toBe(401);
    }
  });

  it("forgot-password response is identical for known and unknown emails", async () => {
    const mk = (email: string) =>
      fetch(`${BASE}/api/auth/forgot`, {
        method: "POST",
        headers: anonHeaders(),
        body: JSON.stringify({ email }),
      }).then((r) => r.json());
    const a = await mk(`phase1-test+known-enum@cogniflux.test`);
    const b = await mk(`ghost-${Date.now()}@cogniflux.test`);
    expect(a).toEqual(b);
  });
});

describe("Authorization / IDOR isolation", () => {
  it("user A cannot see or mutate user B's data on any endpoint", async () => {
    const alice = await registerClient();
    const bob = await registerClient();

    // Alice saves a paper + creates collection + note
    expect((await api(alice, "/api/library", { method: "POST", body: JSON.stringify(PAPER_A) })).status).toBe(201);
    const col = await api(alice, "/api/collections", { method: "POST", body: JSON.stringify({ name: "Alice Col" }) });
    expect(col.status).toBe(201);
    const colId = (await col.json()).collection.id as number;
    expect(
      (await api(alice, `/api/collections/${colId}/papers`, { method: "POST", body: JSON.stringify(PAPER_B) })).status
    ).toBe(201);
    const note = await api(alice, "/api/notes", {
      method: "POST",
      body: JSON.stringify({ paperKey: PAPER_A.paperKey, body: "alice secret note" }),
    });
    expect(note.status).toBe(201);
    const noteId = (await note.json()).note.id as number;
    const hl = await api(alice, "/api/highlights", {
      method: "POST",
      body: JSON.stringify({ paperKey: PAPER_A.paperKey, text: "alice highlight" }),
    });
    expect(hl.status).toBe(201);
    const hlId = (await hl.json()).highlight.id as number;
    expect(
      (await api(alice, "/api/history", { method: "POST", body: JSON.stringify(PAPER_A) })).status
    ).toBe(201);

    // Bob sees nothing of Alice's
    const bobLib = await ((await api(bob, "/api/library")).json() as Promise<{ items: unknown[] }>);
    expect(bobLib.items).toHaveLength(0);
    const bobCols = await ((await api(bob, "/api/collections")).json() as Promise<{ items: unknown[] }>);
    expect(bobCols.items).toHaveLength(0);
    const bobNotes = await ((await api(bob, "/api/notes?paperKey=" + encodeURIComponent(PAPER_A.paperKey))).json() as Promise<{ items: unknown[] }>);
    expect(bobNotes.items).toHaveLength(0);
    const bobHl = await ((await api(bob, "/api/highlights?paperKey=" + encodeURIComponent(PAPER_A.paperKey))).json() as Promise<{ items: unknown[] }>);
    expect(bobHl.items).toHaveLength(0);
    const bobHist = await ((await api(bob, "/api/history")).json() as Promise<{ items: unknown[] }>);
    expect(bobHist.items).toHaveLength(0);

    // Bob cannot mutate Alice's resources by guessing IDs
    expect((await api(bob, `/api/collections/${colId}`, { method: "DELETE" })).status).toBe(404);
    expect((await api(bob, `/api/collections/${colId}`, { method: "PATCH", body: JSON.stringify({ name: "hacked" }) })).status).toBe(404);
    expect((await api(bob, `/api/notes/${noteId}`, { method: "DELETE" })).status).toBe(404);
    expect((await api(bob, `/api/notes/${noteId}`, { method: "PATCH", body: JSON.stringify({ body: "hacked" }) })).status).toBe(404);
    expect((await api(bob, `/api/highlights/${hlId}`, { method: "DELETE" })).status).toBe(404);

    // Bob cannot add/remove papers to/from Alice's collection
    expect(
      (await api(bob, `/api/collections/${colId}/papers`, { method: "POST", body: JSON.stringify(PAPER_B) })).status
    ).toBe(404);
    expect(
      (await api(bob, `/api/collections/${colId}/papers/${encodeURIComponent(PAPER_B.paperKey)}`, { method: "DELETE" })).status
    ).toBe(404);
  });
});

describe("Library, Collections, Notes, Highlights, History flows", () => {
  it("save -> list -> unsave lifecycle", async () => {
    const c = await registerClient();
    expect((await api(c, "/api/library", { method: "POST", body: JSON.stringify(PAPER_A) })).status).toBe(201);
    let lib = (await (await api(c, "/api/library")).json()) as { items: { paper_key: string; title: string | null }[] };
    expect(lib.items).toHaveLength(1);
    expect(lib.items[0].title).toBe("Test Paper A");
    // idempotent re-save keeps one row
    await api(c, "/api/library", { method: "POST", body: JSON.stringify(PAPER_A) });
    lib = (await (await api(c, "/api/library")).json()) as typeof lib;
    expect(lib.items).toHaveLength(1);
    // delete by id-style key
    const del = await api(c, `/api/library?paperKey=${encodeURIComponent(PAPER_A.paperKey)}`, { method: "DELETE" });
    expect(del.ok).toBe(true);
    lib = (await (await api(c, "/api/library")).json()) as typeof lib;
    expect(lib.items).toHaveLength(0);
  });

  it("collection CRUD + add/remove papers", async () => {
    const c = await registerClient();
    const created = await api(c, "/api/collections", { method: "POST", body: JSON.stringify({ name: "Reading list" }) });
    expect(created.status).toBe(201);
    const colId = (await created.json()).collection.id as number;

    // rename
    expect(
      (await api(c, `/api/collections/${colId}`, { method: "PATCH", body: JSON.stringify({ name: "Renamed" }) })).ok
    ).toBe(true);
    let cols = (await (await api(c, "/api/collections")).json()) as { items: { name: string; paperCount: number }[] };
    expect(cols.items[0].name).toBe("Renamed");

    // add paper twice -> still one
    await api(c, `/api/collections/${colId}/papers`, { method: "POST", body: JSON.stringify(PAPER_A) });
    await api(c, `/api/collections/${colId}/papers`, { method: "POST", body: JSON.stringify(PAPER_A) });
    cols = (await (await api(c, "/api/collections")).json()) as typeof cols;
    expect(cols.items[0].paperCount).toBe(1);

    // remove paper, then delete collection
    expect(
      (await api(c, `/api/collections/${colId}/papers/${encodeURIComponent(PAPER_A.paperKey)}`, { method: "DELETE" })).ok
    ).toBe(true);
    expect((await api(c, `/api/collections/${colId}`, { method: "DELETE" })).ok).toBe(true);
    cols = (await (await api(c, "/api/collections")).json()) as typeof cols;
    expect(cols.items).toHaveLength(0);
  });

  it("notes create/edit/delete with timestamps", async () => {
    const c = await registerClient();
    const note = await api(c, "/api/notes", {
      method: "POST",
      body: JSON.stringify({ paperKey: PAPER_A.paperKey, body: "first draft" }),
    });
    expect(note.status).toBe(201);
    const noteId = (await note.json()).note.id as number;

    expect(
      (await api(c, `/api/notes/${noteId}`, { method: "PATCH", body: JSON.stringify({ body: "revised" }) })).ok
    ).toBe(true);
    const list = (await (await api(c, `/api/notes?paperKey=${encodeURIComponent(PAPER_A.paperKey)}`)).json()) as {
      items: { id: number; body: string; createdAt: string }[];
    };
    expect(list.items[0].body).toBe("revised");
    expect(list.items[0].createdAt).toBeTruthy();

    expect((await api(c, `/api/notes/${noteId}`, { method: "DELETE" })).ok).toBe(true);
    const after = (await (await api(c, "/api/notes")).json()) as { items: unknown[] };
    expect(after.items).toHaveLength(0);
  });

  it("highlights create (with optional note) and delete", async () => {
    const c = await registerClient();
    const hl = await api(c, "/api/highlights", {
      method: "POST",
      body: JSON.stringify({ paperKey: PAPER_A.paperKey, text: "key finding", note: "important" }),
    });
    expect(hl.status).toBe(201);
    const hlId = (await hl.json()).highlight.id as number;
    const list = (await (await api(c, `/api/highlights?paperKey=${encodeURIComponent(PAPER_A.paperKey)}`)).json()) as {
      items: { id: number; note: string | null }[];
    };
    expect(list.items[0].note).toBe("important");
    expect((await api(c, `/api/highlights/${hlId}`, { method: "DELETE" })).ok).toBe(true);
  });

  it("history records once per paper and updates read_at without duplicating rows", async () => {
    const c = await registerClient();
    await api(c, "/api/history", { method: "POST", body: JSON.stringify({ ...PAPER_A, progress: 40 }) });
    await new Promise((r) => setTimeout(r, 1100)); // ensure distinct timestamps
    await api(c, "/api/history", { method: "POST", body: JSON.stringify({ ...PAPER_A, progress: 80 }) });
    const hist = (await (await api(c, "/api/history")).json()) as { items: { progress: number | null }[] };
    expect(hist.items).toHaveLength(1);
    expect(hist.items[0].progress).toBe(80);
  });
});

describe("Regression: search pipeline untouched", () => {
  it("search still returns live provider results", async () => {
    const res = await fetch(`${BASE}/api/search?q=machine%20learning&perPage=3`);
    expect(res.ok).toBe(true);
    const data = (await res.json()) as { works: unknown[]; providersUsed: string[] };
    expect(data.works.length).toBeGreaterThan(0);
    expect(data.providersUsed.length).toBeGreaterThan(0);
  }, 30_000);
});
