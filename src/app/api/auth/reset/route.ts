import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { hashPassword, hashToken } from "@/lib/auth/crypto";
import { createSession } from "@/lib/auth/session";
import { PasswordSchema } from "@/lib/auth/validation";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";

/** POST /api/auth/reset  { token, password } */
export async function POST(req: NextRequest) {
  const rl = await rateLimit(`reset:${clientIp(req)}`, 5, 900);
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited", message: "Too many attempts. Please try again later." }, { status: 429 });
  }

  let body: { token?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Invalid request." }, { status: 400 });
  }

  const token = typeof body.token === "string" && body.token.length >= 20 && body.token.length <= 100 ? body.token : null;
  const parsedPw = PasswordSchema.safeParse(body.password);
  if (!token || !parsedPw.success) {
    return NextResponse.json(
      { error: "validation", message: parsedPw.success ? "This reset link is invalid or has expired." : parsedPw.error.issues[0]?.message },
      { status: 400 }
    );
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ user_id: string }>(
      `UPDATE password_reset_tokens SET used_at = now()
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       RETURNING user_id`,
      // token stored hashed; lookup by hash
      [hashToken(token)]
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "invalid_token", message: "This reset link is invalid or has expired." }, { status: 400 });
    }
    const passwordHash = await hashPassword(parsedPw.data);
    await client.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, rows[0].user_id]);
    // invalidate all existing sessions of this account after a reset
    await client.query(`DELETE FROM sessions WHERE user_id = $1`, [rows[0].user_id]);
    await client.query("COMMIT");
    await createSession(rows[0].user_id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[reset]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "server", message: "Something went wrong. Please try again." }, { status: 500 });
  } finally {
    client.release();
  }
}
