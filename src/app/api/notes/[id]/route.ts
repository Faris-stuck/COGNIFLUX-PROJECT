import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { NoteUpdateSchema } from "@/lib/auth/validation";

export const dynamic = "force-dynamic";

/** PATCH /api/notes/:id - edit note body. IDOR-safe. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "bad_request", message: "Invalid note." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Invalid request." }, { status: 400 });
  }
  const parsed = NoteUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", message: parsed.error.issues[0]?.message ?? "Invalid note." }, { status: 400 });
  }

  const res = await getPool().query(
    `UPDATE notes SET body = $1 WHERE id = $2 AND user_id = $3`,
    [parsed.data.body, id, user.id]
  );
  if (!res.rowCount) return NextResponse.json({ error: "not_found", message: "Note not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/notes/:id */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "bad_request", message: "Invalid note." }, { status: 400 });
  }
  const res = await getPool().query(`DELETE FROM notes WHERE id = $1 AND user_id = $2`, [id, user.id]);
  if (!res.rowCount) return NextResponse.json({ error: "not_found", message: "Note not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
