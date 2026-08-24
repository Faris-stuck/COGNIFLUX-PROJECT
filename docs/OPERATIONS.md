# COGNIFLUX — Operations

Runbook for the live service. Status markers: **[planned]** = not yet built,
**[live]** = working today.

## Health endpoints

- `GET /api/health` **[planned, being added in parallel]** — fast liveness probe:
  process up + Redis PING. Returns 200/503. Used by reverse proxy and monitoring.
- `GET /api/health/deep` **[planned]** — checks PostgreSQL (`SELECT 1`), Redis ping,
  and a lightweight provider reachability sample (with short timeout). Never call in
  hot paths; intended for periodic monitors only.

## Logging conventions **[being introduced]**

- One JSON object per line (stdout), e.g.
  `{"ts":"...","level":"info","requestId":"...","route":"/api/search","msg":"..."}`
- Every request gets a `requestId` (generated at ingress, echoed in responses and
  propagated through provider calls) so a user report maps to one grep.
- Levels: `debug` (off by default), `info`, `warn`, `error`. No secrets, no PII
  beyond session identifiers.

## Provider outage playbook

**Observed incident**: OpenAlex anonymous search returned **503 during cluster load**
(2026). The orchestrator already degrades gracefully — a failing provider never fails
the whole search; partial results carry `providersFailed[]` and the UI shows a
human-friendly degraded notice.

Expected **user impact when OpenAlex is down**: noticeably fewer results / weaker
coverage ranking; searches still succeed via Crossref (+ education providers where
applicable). Paper detail may lack OA links or abstract rebuilds for OpenAlex-only
works.

Response steps:
1. Check `/api/health/deep` provider section (or provider health table once the
   recording worker exists).
2. Confirm whether it's us (rate limit / network) or them (status.openalex.org).
3. Do nothing heroic — cache absorbs most traffic; wait out the outage. Escalate only
   if ALL providers fail simultaneously (then suspect our egress/network).

### Cache TTLs

| Cache | TTL | State |
|---|---|---|
| Search results | 900 s (15 min) | live |
| Home feed | 6 h | planned |

During an outage, do **not** flush caches — they are the degradation shield.

## Rate limits (auth routes)

| Route | Limit |
|---|---|
| `POST /api/auth/register` | 5 per 900 s per IP |
| `POST /api/auth/login` | 10 per 900 s per IP **and** 15 per 900s per account |
| `POST /api/auth/forgot-password` | 3 per 900 s |
| `POST /api/auth/reset-password` | 5 per 900 s |

Exceeded → HTTP 429 with `Retry-After`. Login limits are dual-keyed (IP + account)
to blunt both spraying and targeted lockout abuse.

## Backups **[live]**

- `scripts/backup_db.sh` → gzip dump to `~/backups/cogniflux/cogniflux-pre-<stamp>.sql.gz`,
  integrity-verified (`gzip -t`), prints dump line/table counts. Run before any
  migration. Scheduling into cron is part of deploy hardening.

## Deploy gate

`scripts/deploy_check.sh` runs typecheck, tests, PG/Redis readiness, and curls
`/api/health`; prints PASS/FAIL summary. It is read-only — no destructive steps.
