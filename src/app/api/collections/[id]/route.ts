import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { CollectionCreateSchema } from "@/lib/auth/validation";

export const dynamic = "force-dynamic";

/** Authorization guard: collection must belong to the session user. Returns id if owned. */
async function ownedCollection(userId: string, id: number): Promise<number | null> {
  const { rows } = await getPool().query<{ id: number }>(
    `SELECT id FROM collections WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0]?.id ?? null;
}

/** PATCH /api/collections/:id - rename. IDOR-safe: scoped to owner. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "bad_request", message: "Invalid collection." }, { status: 400 });
  }
  if (!(await ownedCollection(user.id, id))) {
    return NextResponse.json({ error: "not_found", message: "Collection not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Invalid request." }, { status: 400 });
  }
  const parsed = CollectionCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", message: parsed.error.issues[0]?.message ?? "Invalid name." }, { status: 400 });
  }
  await getPool().query(`UPDATE collections SET name = $1 WHERE id = $2`, [parsed.data.name, id]);
  return NextResponse.json({ ok: true });
}

/** DELETE /api/collections/:id - delete collection + its items (cascade). */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "bad_request", message: "Invalid collection." }, { status: 400 });
  }
  if (!(await ownedCollection(user.id, id))) {
    return NextResponse.json({ error: "not_found", message: "Collection not found." }, { status: 404 });
  }
  await getPool().query(`DELETE FROM collections WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
