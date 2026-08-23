import { cookies } from "next/headers";
import { getPool } from "@/lib/db";
import { generateSessionToken, hashToken } from "./crypto";

export const SESSION_COOKIE = "cf_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionUser {
  id: string;
  email: string;
}

/** Create a session row + set the cookie. Token stored hashed (SHA-256). */
export async function createSession(userId: string): Promise<void> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await getPool().query(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)`,
    [hashToken(token), userId, expiresAt]
  );
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

/** Resolve current user from session cookie. Returns null for guests. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const { rows } = await getPool().query<{ id: string; email: string }>(
    `SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > now()`,
    [hashToken(token)]
  );
  return rows[0] ?? null;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await getPool().query(`DELETE FROM sessions WHERE id = $1`, [hashToken(token)]);
  }
  store.delete(SESSION_COOKIE);
}

/** Purge expired sessions (call opportunistically). */
export async function purgeExpiredSessions(): Promise<void> {
  await getPool().query(`DELETE FROM sessions WHERE expires_at < now()`);
}
