import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { invalidatePersona, normalizeInterests } from "@/lib/persona";

export const dynamic = "force-dynamic";

/**
 * Persona / preference schema. Stored on the existing `profiles` table
 * (`level` holds the persona key). Kept local to this route so the shared
 * auth schemas stay untouched.
 */
const PreferencesSchema = z.object({
  level: z.enum(["elementary", "middle", "high", "vocational", "university", "researcher"]).optional(),
  locale: z.enum(["id", "en"]).optional(),
  // Accept up to 20 raw items; normalizeInterests() (below) trims, dedupes
  // and caps at 10 — rejecting a >10 payload outright would punish users
  // for exactly the overflow the UI prevents server-side.
  interests: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  name: z.string().trim().max(80).optional(),
});

/** GET /api/preferences - current persona settings. 401 for guests. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { rows } = await getPool().query(
    `SELECT name, locale, level, interests FROM profiles WHERE user_id = $1`,
    [user.id]
  );
  const row = rows[0] ?? {};
  return NextResponse.json({ profile: row });
}

/** PATCH /api/preferences - upsert persona settings for the signed-in user. */
export async function PATCH(req: NextRequest) {
  const rl = await rateLimit(`preferences:${clientIp(req)}`, 30, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? 60) } }
    );
  }

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Invalid request." }, { status: 400 });
  }
  const parsed = PreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", message: parsed.error.issues[0]?.message ?? "Invalid input.", field: parsed.error.issues[0]?.path[0] },
      { status: 400 }
    );
  }
  const { level, locale, interests, name } = parsed.data;
  const hasUpdates = level !== undefined || locale !== undefined || interests !== undefined || name !== undefined;
  const normalizedInterests = interests ? normalizeInterests(interests) : null;

  // Upsert: profiles row may be missing for pre-existing users.
  const { rows } = hasUpdates
    ? await getPool().query(
        // locale/interests are NOT NULL with defaults in the schema, so the
        // INSERT arm must supply concrete values; the UPDATE arm keeps COALESCE
        // semantics so a partial PATCH never clobbers existing fields.
        `INSERT INTO profiles (user_id, level, locale, interests, name)
         VALUES ($1, $2, COALESCE($3, 'id'), COALESCE($4::text[], '{}'::text[]), $5)
         ON CONFLICT (user_id) DO UPDATE SET
           level     = COALESCE($2, profiles.level),
           locale    = COALESCE($3, profiles.locale),
           interests = COALESCE($4::text[], profiles.interests),
           name      = COALESCE($5, profiles.name)
         RETURNING name, locale, level, interests`,
        [user.id, level ?? null, locale ?? null, normalizedInterests, name ?? null]
      )
    : await getPool().query(
        `SELECT name, locale, level, interests FROM profiles WHERE user_id = $1`,
        [user.id]
      );

  // Persona cache must not serve a stale level/interests after a write.
  await invalidatePersona(user.id);
  return NextResponse.json({ ok: true, profile: rows[0] ?? {} });
}
