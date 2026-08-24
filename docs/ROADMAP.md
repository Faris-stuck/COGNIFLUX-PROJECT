# COGNIFLUX — Roadmap

Status verified against `master` (commits 0317475, 2e345e7, 6a56311).

## Done
- **v0.1 foundation**: provider abstraction (OpenAlex + Crossref), parallel search
  orchestration → dedup → rank, paper detail page, design system v1, responsive shell,
  DB schema applied to PostgreSQL.
- **Phase 1 — Auth + Library**: scrypt password hashing + session cookies;
  bookmarks / collections / notes / highlights / history APIs; IDOR-tested.
- **Phase 5 — Education**: OpenStax + OER (OTL) adapters behind the provider interface,
  bilingual content classifier, taxonomy / search / resource APIs.
- **Phase 6 — Scientific Reader** (just committed): Europe PMC JATS full-text retrieval,
  sanitized `/read/[paperId]` view, reuses library highlights/notes (no migration).
- Tests: 86 total (suite being repaired in parallel toward 86/86).
- Infra today: single `next dev -p 3100` process, PostgreSQL local (25 tables,
  backups at `~/backups/cogniflux/` via `scripts/backup_db.sh`), Redis local healthy.

## Next (priority order)
1. **Stability**: repair test suite to green (86/86); add `/api/health`; introduce
   requestId-scoped JSON log lines.
2. **Health endpoints**: `/api/health` (app) + `/api/health/deep` (PG/Redis/providers) —
   see `docs/OPERATIONS.md`.
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
| Production build | NOT built — dev server only. Do **not** run `npm run build` while `next dev -p 3100` holds `.next/`. Stop dev first. |
| AI layer / ModelLayer | Not implemented |
| Research workspace UI | Described, not wired |
| Admin panel | Not implemented |
| Worker/scheduler processes | None running (provider-health recording unscheduled) |
| Cross-language expansion | Not implemented |
| Canonical paper store | Not implemented |
| Reverse proxy / TLS / domain | Not configured |
| CI | None |
