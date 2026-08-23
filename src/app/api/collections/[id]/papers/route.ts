import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { SavePaperSchema } from "@/lib/auth/validation";

export const dynamic = "force-dynamic";

/** POST /api/collections/:id/papers - add a paper (canonical key + snapshot). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "bad_request", message: "Invalid collection." }, { status: 400 });
  }
  const owned = await getPool().query(`SELECT 1 FROM collections WHERE id = $1 AND user_id = $2`, [id, user.id]);
  if (!owned.rowCount) {
    return NextResponse.json({ error: "not_found", message: "Collection not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Invalid request." }, { status: 400 });
  }
  const parsed = SavePaperSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", message: "Invalid paper reference." }, { status: 400 });
  }
  await getPool().query(
    `INSERT INTO collection_items (collection_id, paper_key, snapshot) VALUES ($1, $2, $3)
     ON CONFLICT (collection_id, paper_key) DO NOTHING`,
    [id, parsed.data.paperKey, JSON.stringify(parsed.data.work ?? {})]
  );
  return NextResponse.json({ ok: true }, { status: 201 });
}
