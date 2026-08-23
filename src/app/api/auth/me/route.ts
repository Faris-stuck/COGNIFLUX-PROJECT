import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { ProfileUpdateSchema } from "@/lib/auth/validation";

export const dynamic = "force-dynamic";

/** GET /api/auth/me - current user + profile. 401 for guests. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { rows } = await getPool().query(
    `SELECT p.name, p.locale, p.level, p.interests, u.email, u.email_verified
     FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = $1`,
    [user.id]
  );
  const profile = rows[0] ?? {};
  return NextResponse.json({ user: { ...user, emailVerified: profile.email_verified }, profile });
}

/** PATCH /api/auth/me - update profile (display name, locale, level, interests). */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Invalid request." }, { status: 400 });
  }
  const parsed = ProfileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", message: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  const { name, locale, level, interests } = parsed.data;

  await getPool().query(
    `INSERT INTO profiles (user_id, name, locale, level, interests)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       name = COALESCE($2, profiles.name),
       locale = COALESCE($3, profiles.locale),
       level = COALESCE($4, profiles.level),
       interests = COALESCE($5, profiles.interests)`,
    [user.id, name ?? null, locale ?? null, level ?? undefined, interests ?? null]
  );
  return NextResponse.json({ ok: true });
}
