# COGNIFLUX

Global Knowledge & Research Intelligence Platform.
Explore Knowledge. Discover Research.

## Stack (chosen from environment inspection)

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router, RSC) + React 19 | One process serves UI + API; fits 3.6GB RAM VPS |
| Language | TypeScript strict | Type safety across provider normalization |
| Database | PostgreSQL 16 (local) | Internal data only - never a corpus mirror |
| Cache | Redis (local) | Search/paper cache with TTL; degrades gracefully |
| Styling | Tailwind v4 + CSS variable tokens | Minimal design system, dark mode via media query |
| Tests | Jest + ts-jest | Pure-logic unit tests (dedup/rank/normalize) |

## Run

```bash
npm install
cp .env.example .env.local   # fill DATABASE_URL / REDIS_URL
npm run dev                  # http://localhost:3100
npm test                     # unit tests
```

## Architecture

```
src/
  app/            routes (home, search, paper/[id], explore, research, learn, library)
    api/search      orchestrated search endpoint
    api/papers/[id] canonical paper fetch
    api/providers   provider capability listing
  lib/
    types.ts        canonical Work schema (zod-validated)
    db.ts           pg pool + redis + cached() helper
    providers/
      types.ts        AcademicProvider interface + capabilities
      openalex.ts     OpenAlex adapter (+ inverted-index abstract rebuild)
      crossref.ts     Crossref adapter (+ JATS abstract cleaning)
      orchestrator.ts parallel fan-out -> dedup -> rank -> paginate
  components/     nav-bar, search-bar, work-card
db/schema.sql     full internal schema (24 tables)
tests/            dedup/ranking/normalizer unit tests
```

### Search pipeline

USER QUERY → zod validation → Redis cache check → **parallel** provider calls
(each with timeout) → normalize to `Work` → dedupe (DOI > title+year fuzzy)
→ rank (coverage 45% + title-hit 20% + citations 20% log-scaled + recency 15%)
→ canonical pagination → cache 15 min → JSON/UI.

A failing provider never fails the search: partial results carry
`providersFailed[]` and the UI shows a human-friendly degraded notice.

## Principles

- Academic content is fetched live from providers and cached; PostgreSQL stores
  only users/library/workspaces/AI/provider-health data.
- No hardcoded secrets. `.env*` is gitignored. Frontend never talks to providers directly.
