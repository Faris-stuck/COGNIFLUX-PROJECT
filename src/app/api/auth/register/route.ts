import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { hashPassword } from "@/lib/auth/crypto";
import { createSession } from "@/lib/auth/session";
import { RegisterSchema } from "@/lib/auth/validation";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/register  { email, password }
 * Generic error message on duplicate email to prevent account enumeration.
 */
export async function POST(req: NextRequest) {
  const rl = await rateLimit(`register:${clientIp(req)}`, 5, 900);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? 900) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Invalid request." }, { status: 400 });
  }

  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    // Field-level validation is safe to expose (format rules, not account state).
    return NextResponse.json(
      { error: "validation", message: parsed.error.issues[0]?.message ?? "Invalid input.", field: parsed.error.issues[0]?.path[0] },
      { status: 400 }
    );
  }
  const { email, password } = parsed.data;

  const existing = await getPool().query(`SELECT 1 FROM users WHERE email = $1`, [email]);
  if (existing.rowCount && existing.rowCount > 0) {
    return NextResponse.json(
      { error: "register_failed", message: "We couldn't create this account with the given details." },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password);
  const inserted = await getPool().query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id`,
    [email, passwordHash]
  );
  const userId = inserted.rows[0].id;
  await getPool().query(`INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [userId]);

  await createSession(userId);
  return NextResponse.json({ ok: true, user: { id: userId, email } }, { status: 201 });
}
