import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** DELETE /api/collections/:id/papers/:paperId */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; paperId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const p = await ctx.params;
  const id = Number(p.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "bad_request", message: "Invalid collection." }, { status: 400 });
  }
  const owned = await getPool().query(`SELECT 1 FROM collections WHERE id = $1 AND user_id = $2`, [id, user.id]);
  if (!owned.rowCount) {
    return NextResponse.json({ error: "not_found", message: "Collection not found." }, { status: 404 });
  }
  let paperKey: string;
  try {
    paperKey = decodeURIComponent(p.paperId);
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Invalid paper reference." }, { status: 400 });
  }
  if (!paperKey || paperKey.length > 200) {
    return NextResponse.json({ error: "bad_request", message: "Invalid paper reference." }, { status: 400 });
  }
  await getPool().query(`DELETE FROM collection_items WHERE collection_id = $1 AND paper_key = $2`, [id, paperKey]);
  return NextResponse.json({ ok: true });
}
