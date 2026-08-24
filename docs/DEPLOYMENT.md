# COGNIFLUX — Deployment

Intended production topology and the honest gap between today's state and that target.

## Target production topology (single VPS)

```
Cloudflare (TLS, DNS)
   └─ nginx or caddy (reverse proxy, :80/:443 → 127.0.0.1:3100)
        └─ cogniflux-web: next start -p 3100   (PM2 or systemd)
             ├─ PostgreSQL 16  (localhost, co-located)
             └─ Redis          (localhost, co-located)
```

- **App**: standalone `next start -p 3100`, bound to loopback; only the reverse proxy
  is exposed. One process serves UI + API (fits the small VPS).
- **Process manager**: PM2 (`pm2 start npm --name cogniflux-web -- run start`) or a
  systemd unit — pick one, don't mix.
- **PostgreSQL + Redis**: co-located on same VPS, loopback-only listeners.
- **TLS**: terminated at Cloudflare (Full strict) with an origin certificate on
  nginx/caddy.

## Environment variables (NAMES ONLY — values live in `.env*`, gitignored)

| Name | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | lib/db | Postgres connection string |
| `REDIS_URL` | lib/db | Redis connection string |
| `SESSION_SECRET` | auth (planned for prod hardening) | rotate per environment |

Never commit values. Frontend never talks to providers directly.

## Migrations

Plain SQL files in `db/migrations/NNN_name.sql`, applied manually via psql:

```bash
# ALWAYS snapshot first
./scripts/backup_db.sh
sudo -u postgres psql -d cogniflux -f db/migrations/001_auth_library.sql
```

- Files are numbered and append-only; no ORM migration runner exists.
- `scripts/backup_db.sh` dumps to `~/backups/cogniflux/` as gzip and verifies it.
- Record applied migrations in this file's changelog section below when run in prod.

## Deploy procedure (once build exists)

1. Stop dev server (`next dev -p 3100` holds `.next/`).
2. `npm ci && npx tsc --noEmit && npx jest && ./scripts/deploy_check.sh --pre-build`
3. `npm run build` then `npm run start` under PM2/systemd.
4. Apply any pending migrations (snapshot first).
5. Smoke: `/api/health`, one search query, one reader page load.

**Constraint**: never run `npm run build` while the dev server is running — both write
`.next/`. This has bitten setups before; document, don't improvise.

## CURRENT vs TARGET gap table

| Area | CURRENT (verified) | TARGET |
|---|---|---|
| App runtime | production standalone build verified on loopback `:3101`; dev server still the day-to-day process | `next start`/standalone on `:3100` under PM2/systemd |
| Production build | `output: "standalone"` builds clean in ~85s, peak node RSS ~1.8–2.4GB, artifact 96MB | unchanged + built in CI |
| Reverse proxy | none | nginx/caddy on loopback→3100 |
| TLS / domain | none | Cloudflare TLS + origin cert |
| PostgreSQL | local, 25 tables, backup script works | unchanged (co-located, loopback) |
| Backups | manual `scripts/backup_db.sh` → `~/backups/cogniflux/` | + scheduled cron + restore drill |
| Redis | local healthy; outage path verified to degrade open (bounded reconnect + 10s circuit breaker) | unchanged |
| Health checks | `/health` (liveness, 200 degraded / 503 on PG loss) and `/readyz` (readiness, 503 if ANY dep down) — both verified by failure injection | wired into proxy & external monitoring |
| CI | none | tsc + jest + deploy_check gate before deploy |
| Logs | JSON access lines (requestId) on `/api/search` + `/api/education/search` via `withRequestId`; rest still ad-hoc | all routes wrapped |
| Secrets | env files, uncommitted; `scripts/scan_secrets.sh` verifies no leakage into artifacts | unchanged + documented rotation |
| Process manager | none — RC test instance launched manually | PM2 or systemd with restart-on-failure |

## Release Candidate validation (2026-08-24)

Reproduce with:

```bash
bash scripts/rc_state_snapshot.sh              # record pre-change state
bash scripts/build_prod.sh                     # build + memory instrumentation
bash scripts/start_prod_test.sh                # standalone on 127.0.0.1:3101
bash scripts/smoke_prod.sh                     # 53 functional checks
bash scripts/test_health_failures.sh           # dependency failure injection
bash scripts/mem_profile_prod.sh               # per-phase memory profile
APP_URL=http://127.0.0.1:3101 bash scripts/deploy_check.sh
```

Measured on this VPS (3723MB total):

| Metric | Value |
|---|---|
| Build exit / duration | 0 / 85s |
| Build peak node RSS | 1789–2447MB (min system available 524MB) |
| Standalone artifact | 96MB, `.next/standalone/server.js` |
| Prod startup | ready in ~253ms |
| Prod idle RSS | 212MB |
| Prod peak RSS (20 concurrent) | 221MB |
| Smoke test | 53/53 |
| Failure injection | 14/14 |
| Jest | 86/86 |
| deploy_check | 7/7 |

**The build, not the running app, is the memory risk.** The production process
sits at ~220MB (about 6% of the box), but `next build` peaked at 2.4GB with only
524MB left free. Do not build while the app serves traffic on this VPS — build
elsewhere, or accept a maintenance window.

## Changelog of prod migrations

_(none applied in production yet — dev DB carries all migrations to date)_
