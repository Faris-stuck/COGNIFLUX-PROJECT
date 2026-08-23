import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { HighlightCreateSchema } from "@/lib/auth/validation";

export const dynamic = "force-dynamic";

/** GET /api/highlights?paperKey=... */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const paperKey = req.nextUrl.searchParams.get("paperKey");
  const rows =
    paperKey && paperKey.length <= 200
      ? await getPool().query(
          `SELECT id, paper_key AS "paperKey", text, note, color, section_anchor AS "sectionAnchor",
                  created_at AS "createdAt"
           FROM highlights WHERE user_id = $1 AND paper_key = $2 ORDER BY created_at DESC LIMIT 500`,
          [user.id, paperKey]
        )
      : await getPool().query(
          `SELECT id, paper_key AS "paperKey", text, note, color, section_anchor AS "sectionAnchor",
                  created_at AS "createdAt"
           FROM highlights WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500`,
          [user.id]
        );
  return NextResponse.json({ items: rows.rows });
}

/** POST /api/highlights { paperKey, text, note?, sectionAnchor?, color? } */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Invalid request." }, { status: 400 });
  }
  const parsed = HighlightCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", message: parsed.error.issues[0]?.message ?? "Invalid highlight." },
      { status: 400 }
    );
  }
  const { paperKey, text, note, sectionAnchor, color } = parsed.data;
  const { rows } = await getPool().query<{ id: number; created_at: string }>(
    `INSERT INTO highlights (user_id, paper_key, text, note, color, section_anchor)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`,
    [user.id, paperKey, text, note ?? null, color, sectionAnchor ?? null]
  );
  return NextResponse.json({ highlight: { id: rows[0].id, createdAt: rows[0].created_at } }, { status: 201 });
}
