import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** DELETE /api/highlights/:id */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "bad_request", message: "Invalid highlight." }, { status: 400 });
  }
  const res = await getPool().query(`DELETE FROM highlights WHERE id = $1 AND user_id = $2`, [id, user.id]);
  if (!res.rowCount) return NextResponse.json({ error: "not_found", message: "Highlight not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
