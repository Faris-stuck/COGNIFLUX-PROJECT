# SPEC — Phase 9: Persona Layer

## Objective
Turn the existing persona *storage* (profiles.level/interests via /api/preferences)
into a persona *engine* that personalizes the product surface:

1. Home shows a "For you" feed built from the signed-in user's interests.
2. Persona onboarding collects interests (topic chips), not just education level.
3. `/ask` adapts explanation register to the user's education level.

## Non-goals
- No new tables/migrations (reuse `profiles.level`, `profiles.interests`).
- No per-user feed computation (cache is per-topic-set, see cost model).
- No collaborative filtering / embedding similarity (future phase).

## Design

### Cost model (RAM + upstream friendly)
- Feed cache key = `sha1(interests.join("|"))`, TTL 1h, stored in Redis via
  existing `cached()` helper. N users with the same topic set share ONE
  provider call. Anonymous or interest-less users never touch this path.
- Feed size 5, single orchestrator search per request (no fan-out amplification).

### `src/lib/persona.ts`
- `getPersona(userId): Promise<Persona>` — {level, interests[]} from profiles;
  Redis-cached 30 min per user (`cf:persona:<id>`), invalidated by
  `invalidatePersona(userId)` called from PATCH /api/preferences.
- `forYouFeed(persona): Promise<Work[]>` — [] if no interests; else
  cached search with joined interests as query; degrades to [] on outage
  (never throws — home must render).

### Ask integration
- `askQuestion(question, provider, locale, persona?)` — when persona.level is
  set, append a register instruction (SD/SMP/SMA/SMK → simpler language;
  university/researcher → technical). Prompt injection defense unchanged:
  interests are NOT put in the system prompt (user-controlled strings).

### Onboarding UI
- After level chosen → second step: topic chips (12 curated, mapped to the
  education taxonomy subjects + popular research areas) + free-text add
  (max 10 total, same server limit). PATCH with `interests`.

## Acceptance criteria
- [ ] Home for user with interests shows "Untukmu" section (integration test
      via API-level persona + feed determinism; render path covered by unit).
- [ ] Same interest set → same cache key (unit).
- [ ] PATCH /api/preferences invalidates persona cache (integration).
- [ ] askQuestion with level=high includes simplified register line in
      messages; without persona behaves exactly as Phase 8 (regression unit).
- [ ] Existing 118 tests stay green; contract PASS; typecheck clean.
