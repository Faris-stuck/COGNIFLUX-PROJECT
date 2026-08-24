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
| App runtime | single `next dev -p 3100` dev process | `next start -p 3100` prod build under PM2/systemd |
| Production build | not built (dev server occupies `.next/`) | built artifact, rebuilt on each deploy |
| Reverse proxy | none | nginx/caddy on loopback→3100 |
| TLS / domain | none | Cloudflare TLS + origin cert |
| PostgreSQL | local, 25 tables, backup script works | unchanged (co-located, loopback) |
| Backups | manual `scripts/backup_db.sh` → `~/backups/cogniflux/` | + scheduled cron + restore drill |
| Redis | local healthy | unchanged |
| Health checks | `/api/health` live (PG+Redis latency, 200 ok / 503 when PG down) | wired into proxy & external monitoring |
| CI | none | tsc + jest gate before deploy |
| Logs | JSON access lines (requestId) on `/api/search` + `/api/education/search` via `withRequestId`; rest still ad-hoc | all routes wrapped |
| Secrets | env files, uncommitted | unchanged + documented rotation |

## Changelog of prod migrations

_(none applied in production yet — dev DB carries all migrations to date)_
