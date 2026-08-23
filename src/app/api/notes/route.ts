import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { NoteCreateSchema } from "@/lib/auth/validation";

export const dynamic = "force-dynamic";

/** GET /api/notes?paperKey=... - list notes (optionally filtered by paper). */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const paperKey = req.nextUrl.searchParams.get("paperKey");
  const rows =
    paperKey && paperKey.length <= 200
      ? await getPool().query(
          `SELECT id, paper_key AS "paperKey", collection_id AS "collectionId", body, created_at AS "createdAt"
           FROM notes WHERE user_id = $1 AND paper_key = $2 ORDER BY created_at DESC LIMIT 200`,
          [user.id, paperKey]
        )
      : await getPool().query(
          `SELECT id, paper_key AS "paperKey", collection_id AS "collectionId", body, created_at AS "createdAt"
           FROM notes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`,
          [user.id]
        );
  return NextResponse.json({ items: rows.rows });
}

/** POST /api/notes { paperKey?, collectionId?, body } */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Invalid request." }, { status: 400 });
  }
  const parsed = NoteCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", message: parsed.error.issues[0]?.message ?? "Invalid note." }, { status: 400 });
  }

  // If attached to a collection, verify ownership (IDOR guard).
  const { paperKey, collectionId, body: text } = parsed.data;
  if (collectionId != null) {
    const owned = await getPool().query(`SELECT 1 FROM collections WHERE id = $1 AND user_id = $2`, [collectionId, user.id]);
    if (!owned.rowCount) return NextResponse.json({ error: "not_found", message: "Collection not found." }, { status: 404 });
  }
  if ((paperKey == null || paperKey === "") && collectionId == null) {
    return NextResponse.json({ error: "validation", message: "A note needs a paper or a collection." }, { status: 400 });
  }

  const { rows } = await getPool().query<{ id: number; created_at: string }>(
    `INSERT INTO notes (user_id, paper_key, collection_id, body)
     VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
    [user.id, paperKey || null, collectionId ?? null, text]
  );
  return NextResponse.json({ note: { id: rows[0].id, createdAt: rows[0].created_at } }, { status: 201 });
}
