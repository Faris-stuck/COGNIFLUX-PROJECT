# COGNIFLUX — Roadmap

Status verified against `main` (through Phase 7 commits, 2026-09-11).

## Done
- **v0.1 foundation**: provider abstraction (OpenAlex + Crossref), parallel search
  orchestration → dedup → rank, paper detail page, design system v1, responsive shell,
  DB schema applied to PostgreSQL.
- **Phase 1 — Auth + Library**: scrypt password hashing + session cookies;
  bookmarks / collections / notes / highlights / history APIs; IDOR-tested.
- **Phase 5 — Education**: OpenStax + OER (OTL) adapters behind the provider interface,
  bilingual content classifier, taxonomy / search / resource APIs.
- **Phase 6 — Scientific Reader**: Europe PMC JATS full-text retrieval,
  sanitized `/read/[paperId]` view, reuses library highlights/notes (no migration).
- **Phase 7 — Indonesia Learning** (2026-09, committed `63ac7b2`+`c621373`): `/persiapan`
  program catalog, practice/tryout engine with attempt-integrity migrations (002–005),
  CMS + site navigation, bilingual ID/EN i18n layer (locale cookie, switcher, page
  translator), SEO robots/sitemap, question-source ingestion scripts.
- **Stability**: `/health` + `/readyz` probes live in prod.
- Tests: **87/87 green** (6 suites) + `npm run verify` gate (typecheck + unit + contract).
- Infra today: production standalone build behind nginx + Cloudflare at
  https://cogniflux.web.id (systemd `cogniflux.service`, Node 22 pinned), PostgreSQL
  local (40 tables, backups via `scripts/backup_db.sh`), Redis local healthy.

## Next (priority order)
1. ~~Stability~~ done except: requestId-scoped JSON log lines.
2. ~~Health endpoints~~ done (`/health`, `/readyz`).
2b. ~~Phase 7 test coverage~~ done (2026-09-12): `tests/phase7-prep-integration.test.ts`
   12/12 green against the running server; fixed `getAttempt` NUMERIC→string
   coercion + bigint-safe test payloads. Full gate now **99 tests** (6 suites + phase7).
3. ~~Persona layer~~ **done Phase 9 (2026-09-12)**: `src/lib/persona.ts` —
   cached persona per user, interest-set-keyed "Untukmu" feed on home
   (shared cache → 1 provider call/hour per topic set), onboarding step 2
   topic chips, level-aware register in `/api/ask`. Gate now **126 tests**.
   Next for persona: interest chips in profile settings page + follow topics
   from search results.
4. ~~AI layer / ModelLayer~~ **done Phase 8 (2026-09-12)**: provider-agnostic
   `src/lib/models/` (ZRouter OpenAI-compat + NullProvider), grounded `/ask`
   + `/api/ask` with citation validation, rate limit 12/60s, search-only
   degrade path. Live at cogniflux.web.id/ask. Next in-layer: multi-turn,
   `ai_queries` usage logging table (needs migration — ask first).
5. **Admin panel**: provider health dashboard (latency/error tracking already shaped
   in schema), rate-limit observability.
6. **Deploy hardening**: production build (`next build`) + standalone `next start`
   behind nginx/caddy reverse proxy with TLS via Cloudflare; PM2/systemd unit;
   CI pipeline. See `docs/DEPLOYMENT.md`.
7. Later: cross-language query expansion, canonical paper store, worker/scheduler
   processes (provider health recording job), research workspace UI wiring.

## Known gaps (intentional, not silent)
| Area | State |
|---|---|
| Phase 7 test coverage | Integration 12/12 green; CMS/IDOR-with-account cases still thin |
| AI layer / ModelLayer | v1 shipped (single-turn, grounded); multi-turn + usage logging pending |
| Admin panel | Not implemented |
| Worker/scheduler processes | None running (provider-health recording unscheduled) |
| Cross-language expansion | Not implemented |
| Canonical paper store | Not implemented |
| CI | None (GitHub Actions blocked for this account's private repos; repo is public — verify locally via `npm run verify`) |
