import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/history - reading history (most recent first).
 * POST /api/history { paperKey, snapshot? , progress? } - upsert last_opened.
 * Privacy: only recorded for signed-in users; guests are never tracked.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { rows } = await getPool().query(
    `SELECT paper_key AS "paperKey",
            snapshot->>'title' AS title,
            snapshot#>>'{authors,0,name}' AS "firstAuthor",
            snapshot->>'publicationYear' AS year,
            progress,
            read_at AS "readAt"
     FROM reading_history WHERE user_id = $1
     ORDER BY read_at DESC LIMIT 100`,
    [user.id]
  );
  return NextResponse.json({ items: rows });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: { paperKey?: unknown; work?: unknown; progress?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Invalid request." }, { status: 400 });
  }

  const paperKey =
    typeof body.paperKey === "string" && body.paperKey.trim().length >= 3 && body.paperKey.length <= 200
      ? body.paperKey.trim()
      : null;
  if (!paperKey) return NextResponse.json({ error: "validation", message: "Invalid paper reference." }, { status: 400 });

  const progress =
    typeof body.progress === "number" && Number.isFinite(body.progress)
      ? Math.max(0, Math.min(100, Math.round(body.progress)))
      : null;

  let snapshot: Record<string, unknown> = {};
  if (body.work && typeof body.work === "object") {
    const w = body.work as Record<string, unknown>;
    snapshot = {
      title: typeof w.title === "string" ? w.title.slice(0, 500) : undefined,
      authors: Array.isArray(w.authors) ? w.authors.slice(0, 5) : undefined,
      publicationYear: typeof w.publicationYear === "number" ? w.publicationYear : undefined,
    };
    // drop undefined values via JSON round-trip
    snapshot = JSON.parse(JSON.stringify(snapshot));
  }

  await getPool().query(
    `INSERT INTO reading_history (user_id, paper_key, snapshot, progress, read_at)
     VALUES ($1, $2, $3::jsonb, $4, now())
     ON CONFLICT (user_id, paper_key) DO UPDATE
       SET read_at = now(),
           progress = COALESCE($4, reading_history.progress),
           snapshot = CASE WHEN $3::jsonb = '{}'::jsonb THEN reading_history.snapshot ELSE $3::jsonb END`,
    [user.id, paperKey, JSON.stringify(snapshot), progress]
  );
  return NextResponse.json({ ok: true }, { status: 201 });
}
