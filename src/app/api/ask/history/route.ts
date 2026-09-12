import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRequestId } from "@/lib/observability";
import { getSessionUser } from "@/lib/auth/session";
import { getPool } from "@/lib/db";
import { getOwnedConversation } from "@/lib/ai-store";

export const dynamic = "force-dynamic";

const Query = z.object({ conversationId: z.coerce.number().int().positive() });

/**
 * GET /api/ask/history?conversationId=N (Phase 10b)
 * Turns of one's own conversation, oldest first. Ownership-checked: a
 * foreign id yields 404, never leaked content. Guests: 401.
 */
export const GET = withRequestId(async (req: NextRequest) => {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "invalid_conversation" }, { status: 400 });

  const owned = await getOwnedConversation(user.id, parsed.data.conversationId);
  if (!owned) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { rows } = await getPool().query(
    `SELECT id, role, content, evidence, created_at FROM ai_messages
      WHERE conversation_id = $1 ORDER BY id ASC LIMIT 200`,
    [owned.id],
  );
  return NextResponse.json({
    conversationId: owned.id,
    turns: rows.map((r) => ({
      id: Number(r.id),
      role: r.role,
      content: r.content,
      evidence: r.evidence,
      at: r.created_at,
    })),
  });
});
