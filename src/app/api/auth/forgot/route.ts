import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { generateResetToken, hashToken } from "@/lib/auth/crypto";
import { EmailSchema } from "@/lib/auth/validation";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/forgot  { email }
 * Always returns 200 with the same message whether or not the account exists
 * (anti-enumeration). Tokens are stored hashed; delivery channel (email) is a
 * later phase - for now the token is logged server-side ONLY in development.
 */
export async function POST(req: NextRequest) {
  const rl = await rateLimit(`forgot:${clientIp(req)}`, 3, 900);
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited", message: "Too many attempts. Please try again later." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Invalid request." }, { status: 400 });
  }
  const parsed = EmailSchema.safeParse((body as { email?: unknown })?.email);
  const generic = { ok: true, message: "If that account exists, a reset link has been created. Check your inbox." };
  if (!parsed.success) return NextResponse.json(generic);

  const { rows } = await getPool().query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [parsed.data]);
  if (rows[0]) {
    const token = generateResetToken();
    await getPool().query(
      `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at)
       SELECT $1, $2, now() + interval '1 hour'
       WHERE (SELECT count(*) FROM password_reset_tokens WHERE user_id = $2 AND used_at IS NULL) < 5`,
      [hashToken(token), rows[0].id]
    );
    // TODO(phase-later): deliver via email provider. Never log tokens in production.
    if (process.env.NODE_ENV !== "production") {
      console.log(`[dev-only] password reset token for ${parsed.data}: ${token}`);
    }
  }
  return NextResponse.json(generic);
}
