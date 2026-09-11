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
2b. **Phase 7 test coverage**: unit + integration tests for prep engine, preparation
   APIs (IDOR), i18n dictionaries — none exist yet.
3. **Persona layer**: per-user research persona/profile feeding personalization.
4. **AI layer / ModelLayer**: LLM-provider-agnostic abstraction (intent → retrieval →
   evidence-grounded response). Not started.
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
| Phase 7 test coverage | No unit/integration tests yet for prep/i18n/CMS |
| AI layer / ModelLayer | Not implemented |
| Admin panel | Not implemented |
| Worker/scheduler processes | None running (provider-health recording unscheduled) |
| Cross-language expansion | Not implemented |
| Canonical paper store | Not implemented |
| CI | None (GitHub Actions blocked for this account's private repos; repo is public — verify locally via `npm run verify`) |
