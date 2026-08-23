import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/crypto";
import { createSession } from "@/lib/auth/session";
import { LoginSchema } from "@/lib/auth/validation";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login  { email, password }
 * Uniform failure message + timing for both wrong-email and wrong-password to
 * prevent account enumeration. Per-IP and per-account rate limiting.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const rlIp = await rateLimit(`login:ip:${ip}`, 10, 900);
  if (!rlIp.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rlIp.retryAfter ?? 900) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Invalid request." }, { status: 400 });
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_credentials", message: "Incorrect email or password." }, { status: 401 });
  }
  const { email, password } = parsed.data;

  const rlAccount = await rateLimit(`login:acct:${email}`, 15, 900);
  if (!rlAccount.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rlAccount.retryAfter ?? 900) } }
    );
  }

  const started = Date.now();
  const { rows } = await getPool().query<{ id: string; password_hash: string | null }>(
    `SELECT id, password_hash FROM users WHERE email = $1`,
    [email]
  );

  let ok = false;
  let userId: string | null = null;
  if (rows[0]?.password_hash) {
    userId = rows[0].id;
    ok = await verifyPassword(password, rows[0].password_hash);
  } else {
    // Equalize timing when the account doesn't exist: run a dummy scrypt verify.
    await verifyPassword(password, "scrypt$32768$8$1$00$00");
  }
  const elapsed = Date.now() - started;
  if (elapsed < 250) await new Promise((r) => setTimeout(r, 250 - elapsed));

  if (!ok || !userId) {
    return NextResponse.json({ error: "invalid_credentials", message: "Incorrect email or password." }, { status: 401 });
  }

  await createSession(userId);
  return NextResponse.json({ ok: true, user: { id: userId, email } });
}
