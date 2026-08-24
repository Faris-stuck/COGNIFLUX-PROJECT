import { NextRequest, NextResponse } from "next/server";
import { getFullTextDocument } from "@/lib/reader/service";

export const dynamic = "force-dynamic";

/**
 * GET /api/papers/[id]/fulltext
 * Returns the normalized canonical PaperDocument, or a friendly unavailable
 * envelope (never a stack trace). Shared cache; no user-specific data.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let paperId = id;
  try {
    paperId = decodeURIComponent(id);
  } catch {
    /* keep raw */
  }
  if (!paperId || paperId.length < 4 || paperId.length > 300) {
    return NextResponse.json({ error: "validation", message: "Invalid paper reference." }, { status: 400 });
  }

  const result = await getFullTextDocument(paperId);
  if (!result.available || !result.document) {
    return NextResponse.json(
      {
        available: false,
        reason: result.reason ?? "upstream_error",
        message:
          result.reason === "not_in_epmc"
            ? "Full text isn't available in Cogniflux for this paper."
            : "Full text couldn't be loaded right now.",
      },
      { status: result.reason === "upstream_error" ? 502 : 404 }
    );
  }
  return NextResponse.json({ available: true, document: result.document });
}
