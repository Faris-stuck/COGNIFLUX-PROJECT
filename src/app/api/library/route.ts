import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { SavePaperSchema } from "@/lib/auth/validation";

export const dynamic = "force-dynamic";

/**
 * Slim snapshot schema: library stores only display metadata, never the full
 * provider payload. Deliberately NOT the strict canonical WorkSchema - the
 * client may not know provider-internal fields like id/source.
 */
const SnapshotSchema = z.object({
  title: z.string().max(500).optional(),
  authors: z.array(z.object({ name: z.string().max(200) })).max(10).optional(),
  publicationYear: z.number().int().nullable().optional(),
  journal: z.string().max(300).nullable().optional(),
  doi: z.string().max(100).nullable().optional(),
  openAccess: z
    .object({ isOa: z.boolean(), url: z.string().max(500).nullable().optional() })
    .optional(),
});

/** GET /api/library - saved papers for the signed-in user. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { rows } = await getPool().query(
    `SELECT id, paper_key, snapshot->>'title' AS title,
            snapshot#>>'{authors,0,name}' AS first_author,
            snapshot->>'publicationYear' AS year
     FROM bookmarks WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500`,
    [user.id]
  );
  return NextResponse.json({ items: rows });
}

/** POST /api/library - save a paper. Stores canonical key + small normalized snapshot only. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

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

  // If a work object is provided, validate + slim it before storing.
  let snapshot: Record<string, unknown> = {};
  if (parsed.data.work) {
    const snap = SnapshotSchema.safeParse(parsed.data.work);
    if (snap.success) snapshot = Object.fromEntries(Object.entries(snap.data).filter(([, v]) => v != null));
  }

  await getPool().query(
    `INSERT INTO bookmarks (user_id, paper_key, snapshot) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, paper_key) DO UPDATE SET snapshot = EXCLUDED.snapshot`,
    [user.id, parsed.data.paperKey, JSON.stringify(snapshot)]
  );
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** DELETE /api/library?paperKey=... - remove a saved paper. */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const paperKey = req.nextUrl.searchParams.get("paperKey");
  if (!paperKey || paperKey.length > 200) {
    return NextResponse.json({ error: "bad_request", message: "Invalid paper reference." }, { status: 400 });
  }
  const res = await getPool().query(`DELETE FROM bookmarks WHERE user_id = $1 AND paper_key = $2`, [user.id, paperKey]);
  return NextResponse.json({ ok: true, removed: res.rowCount ?? 0 });
}
