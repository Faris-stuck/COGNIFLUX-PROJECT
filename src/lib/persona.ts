/**
 * Persona layer (Phase 9).
 *
 * Reads the per-user persona (education level + topic interests) stored on
 * `profiles`, caches it in Redis per user (30 min), and derives a
 * "For you" feed whose cache key is the interest SET (sha1), not the user —
 * so N users sharing a topic set trigger ONE upstream provider call per hour.
 *
 * Design constraints (docs/SPEC-phase9-persona-layer.md):
 * - No new tables; reuse profiles.level / profiles.interests.
 * - Nothing here throws: every consumer must degrade to the anonymous path.
 * - Interests are user-controlled strings: never interpolated into the LLM
 *   system prompt (only validated queries go through the orchestrator).
 */
import { createHash } from "crypto";
import type { Work } from "./types";
import { getPool, getRedis, cached } from "./db";

export type PersonaLevel =
  | "elementary"
  | "middle"
  | "high"
  | "vocational"
  | "university"
  | "researcher";

export const PERSONA_LEVELS: PersonaLevel[] = [
  "elementary",
  "middle",
  "high",
  "vocational",
  "university",
  "researcher",
];

export interface Persona {
  level: PersonaLevel | null;
  interests: string[];
}

const EMPTY_PERSONA: Persona = { level: null, interests: [] };
const PERSONA_TTL = 30 * 60; // per-user persona cache, 30 min
const FEED_TTL = 60 * 60; // shared by interest set, 1h
const FEED_SIZE = 5;

function personaKey(userId: string) {
  return `cf:persona:${userId}`;
}

/** Normalized, deduped, capped interest list (server-side truth). */
export function normalizeInterests(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const v = item.trim().toLowerCase().slice(0, 50);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= 10) break;
  }
  return out;
}

export function feedCacheKey(interests: readonly string[]): string {
  const hash = createHash("sha1").update(interests.join("|")).digest("hex").slice(0, 16);
  return `cf:foryou:${hash}`;
}

/** Load a user's persona; Redis-cached; never throws (null row -> empty). */
export async function getPersona(userId: string): Promise<Persona> {
  try {
    return await cached<Persona>(personaKey(userId), PERSONA_TTL, async () => {
      const { rows } = await getPool().query(
        `SELECT level, interests FROM profiles WHERE user_id = $1`,
        [userId],
      );
      const row = rows[0];
      if (!row) return EMPTY_PERSONA;
      return {
        level: (PERSONA_LEVELS as string[]).includes(row.level) ? row.level : null,
        interests: normalizeInterests(row.interests ?? []),
      };
    });
  } catch {
    return EMPTY_PERSONA;
  }
}

/** Drop the cached persona — call after any successful profile write. */
export async function invalidatePersona(userId: string): Promise<void> {
  try {
    const redis = await getRedis();
    await redis.del(personaKey(userId));
  } catch {
    // Redis down: entry expires on its own within 30 min.
  }
}

/**
 * Interest-set-keyed "For you" feed. Returns [] for users without interests
 * and on any upstream failure — callers render it as an optional section.
 */
export async function forYouFeed(interests: readonly string[]): Promise<Work[]> {
  if (interests.length === 0) return [];
  try {
    return await cached<Work[]>(feedCacheKey(interests), FEED_TTL, async () => {
      const { getOrchestrator } = await import("./providers/orchestrator");
      const search = await getOrchestrator().search({
        q: interests.join(" "),
        page: 1,
        perPage: FEED_SIZE,
        openAccessOnly: false,
        sort: "relevance",
      });
      if (search.works.length === 0) {
        // Don't persist empty feeds for an hour — same policy as home-feed.
        throw new Error("foryou: empty result");
      }
      return search.works.slice(0, FEED_SIZE);
    });
  } catch {
    return [];
  }
}

/**
 * LLM register instruction for the ask pipeline (simplified language for
 * younger levels). Derived ONLY from the whitelisted level enum, never from
 * free-text interests, so it is prompt-injection safe.
 */
export function registerInstruction(level: PersonaLevel | null): string | null {
  switch (level) {
    case "elementary":
    case "middle":
      return "The reader is a school child (SD/SMP): use very simple words, short sentences, and an everyday analogy when possible.";
    case "high":
    case "vocational":
      return "The reader is a high-school or vocational student: avoid jargon unless briefly explained.";
    case "university":
      return "The reader is a university student: technical terms are acceptable with brief context.";
    case "researcher":
      return "The reader is a researcher: be precise and technical; emphasize methods and limitations.";
    default:
      return null;
  }
}
