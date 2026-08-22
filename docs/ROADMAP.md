# COGNIFLUX — Roadmap

## Done (v0.1 foundation)
- [x] Phase 0: environment inspection
- [x] Phase 1: stack decision + repo foundation
- [x] Phase 3: provider abstraction (interface, capabilities, OpenAlex, Crossref)
- [x] Phase 4: academic search API + UI (parallel orchestration, dedup, ranking, cache, pagination)
- [x] Paper detail page (metadata, OA link, subjects, source info)
- [x] Design system v1 + responsive shell (nav, footer, dark mode via prefers-color-scheme)
- [x] DB schema (24 tables) applied to PostgreSQL
- [x] Unit tests (dedup/ranking/normalizers) — 7 passing
- [x] E2E smoke: all routes verified against live providers

## Next (priority order)
1. **Phase 5 — Education providers**: OpenStax / DOAJ / OER adapters behind same interface; `/learn` becomes functional
2. **Phase 6 — Reader**: OA full-text retrieval (Unpaywall enrichment), clean reader view with section nav
3. **Phase 7 — Library**: auth (email+password, argon2), sessions, bookmarks/collections/notes APIs
4. **Phase 8/9 — Research intelligence + AI layer**: LLM-provider-agnostic abstraction (intent → retrieval → evidence → response), evidence-grounded answers only
5. **Phase 10 — Admin**: provider health dashboard (latency/error tracking already shaped in schema)
6. **Phase 11–12**: perf (streaming, edge cache) + security hardening (rate limiting, CSRF, headers)
7. **Phase 13–14**: E2E suite (Playwright when browser available), production build + nginx reverse proxy

## Known gaps (intentional, not silent)
- Auth not yet implemented → Library shows empty-state with sign-in notice
- Research tools are described, not wired (AI layer pending) — clearly labeled in UI
- Provider health table exists but health recording job not yet scheduled
