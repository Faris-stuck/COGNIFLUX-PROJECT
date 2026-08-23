import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { CollectionCreateSchema } from "@/lib/auth/validation";

export const dynamic = "force-dynamic";

/** GET /api/collections - list user's collections with item counts. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { rows } = await getPool().query(
    `SELECT c.id, c.name, c.created_at AS "createdAt",
            count(ci.paper_key)::int AS "paperCount"
     FROM collections c LEFT JOIN collection_items ci ON ci.collection_id = c.id
     WHERE c.user_id = $1 GROUP BY c.id ORDER BY c.created_at DESC LIMIT 200`,
    [user.id]
  );
  return NextResponse.json({ items: rows });
}

/** POST /api/collections - create a collection. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Invalid request." }, { status: 400 });
  }
  const parsed = CollectionCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", message: parsed.error.issues[0]?.message ?? "Invalid name." },
      { status: 400 }
    );
  }
  const { rows } = await getPool().query<{ id: number; name: string }>(
    `INSERT INTO collections (user_id, name) VALUES ($1, $2) RETURNING id, name`,
    [user.id, parsed.data.name]
  );
  return NextResponse.json({ collection: rows[0] }, { status: 201 });
}
