import { strict as assert } from "node:assert";
const base = process.env.COGNIFLUX_BASE_URL ?? "http://127.0.0.1:3100";
const host = process.env.COGNIFLUX_HOST ?? "cogniflux.web.id";
const headers = { Host: host, "User-Agent": "Cogniflux-Contract-Check/1.0" };
const routes = ["/", "/explore", "/research", "/learn", "/library", "/login", "/search", "/ask", "/persiapan", "/persiapan/tka-sma-smk/matematika", "/persiapan/tka-sma-smk/matematika/latihan", "/persiapan/tryout", "/persiapan/progress"];
const apis = ["/api/health", "/api/readyz", "/api/providers", "/api/education/taxonomy", "/api/ask", "/api/preparation/catalog", "/api/preparation/practice?program=tka-sma-smk&subject=matematika&limit=5", "/api/preparation/tryouts", "/api/preparation/recommendations"];
for (const path of routes) {
  const r = await fetch(base + path, { headers });
  assert.equal(r.status, 200, `${path} returned ${r.status}`);
  const text = await r.text();
  assert.equal((text.match(/<main\b/g) ?? []).length, 1, `${path} must have exactly one main`);
  assert.equal((text.match(/<h1\b/g) ?? []).length, 1, `${path} must have exactly one h1`);
  assert(!/href=["']javascript:/i.test(text), `${path} contains javascript: link`);
}
for (const path of apis) {
  const r = await fetch(base + path, { headers: { ...headers, Accept: "application/json" } });
  assert.equal(r.status, 200, `${path} returned ${r.status}`);
  const body = await r.json();
  assert(body !== null && typeof body === "object", `${path} must return JSON object`);
}
console.log(`PASS ${routes.length} routes + ${apis.length} APIs`);
