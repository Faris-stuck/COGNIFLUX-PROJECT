import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** POST /api/auth/logout - destroys server session + clears cookie. Idempotent. */
export async function POST() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
