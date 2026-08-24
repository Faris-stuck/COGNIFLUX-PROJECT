# Cogniflux

Content-first research & learning platform: academic paper search across
multiple open providers, an education resource catalog (SD–SMK–university),
a scientific reader, and personal library tooling — built to run on a small
(~4 GB) single VPS.

**Status:** Release Candidate (validated 2026-08-24). Not yet deployed publicly.

## Features

- **Multi-provider academic search** — OpenAlex, Crossref, Europe PMC behind one
  orchestrator with dedup, ranking, per-provider fault isolation, and Redis
  caching. One provider failing never breaks search.
- **Education catalog** — bilingual (ID/EN) classifier, level detection
  (SD/SMP/SMA/SMK/mahasiswa/peneliti), OpenStax + Indonesian OTL providers,
  taxonomy endpoint.
- **Scientific reader** — full-text retrieval and sanitization for open-access
  papers (Europe PMC), section-aware rendering.
- **Personal library** — saved papers, collections, notes, highlights, reading
  history with strict per-user isolation (verified by IDOR tests).
- **Persona onboarding** — optional level/persona selection stored on profiles;
  non-blocking banner, partial PATCH-safe preferences API.
- **Production-grade observability** — `/health` (liveness) and `/readyz`
  (readiness) probes verified by dependency failure injection, JSON access logs
  with request IDs on hot routes.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, standalone output) |
| Database | PostgreSQL 16 (plain SQL migrations, no ORM) |
| Cache / rate limit | Redis |
| Auth | scrypt password hashing + session cookies |
| Tests | Jest + ts-jest (unit + live HTTP integration) |

## Quick start

```bash
npm ci
cp .env.example .env.local        # fill DATABASE_URL (Postgres) + REDIS_URL
psql "$DATABASE_URL" -f db/schema.sql
npm run dev                        # http://localhost:3100
```

## Production build

```bash
npx tsc --noEmit && npx jest       # gate
bash scripts/build_prod.sh         # instrumented standalone build
bash scripts/start_prod_test.sh    # serves 127.0.0.1:3101 from .next/standalone
bash scripts/smoke_prod.sh         # 53 functional checks
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the honest CURRENT-vs-TARGET
gap table, RC validation numbers, and deployment topology.

## Scripts

| Script | Purpose |
|---|---|
| `scripts/deploy_check.sh` | Read-only pre-deploy gate: tsc, jest, pg, redis, health, readyz, secret scan |
| `scripts/build_prod.sh` | `next build` with peak-memory instrumentation |
| `scripts/smoke_prod.sh` | End-to-end smoke test against a running instance |
| `scripts/test_health_failures.sh` | Boots throwaway instances with dead dependencies; verifies probe semantics without touching real services |
| `scripts/scan_secrets.sh` | Greps build artifacts for credential-bearing env values (name-only reporting) |
| `scripts/mem_profile_prod.sh` | Per-phase RSS profile of the production process |
| `scripts/backup_db.sh` | `pg_dump` + gzip integrity verification |

## Security notes

- Secrets live only in `.env.local` (gitignored); `.env.example` carries
  placeholders. `getPool()` refuses to start without `DATABASE_URL` instead of
  falling back to hardcoded credentials.
- Rate limiting is Redis-backed fixed-window and stays fully armed in tests —
  tests isolate themselves via unique `X-Forwarded-For` values rather than
  weakening limits.
- Auth responses are asserted to never leak password material; registration and
  login are anti-enumeration by design.

## License

Private project — all rights reserved unless a license file is added.
