import { NextRequest, NextResponse } from "next/server";
import { getFullTextDocument } from "@/lib/reader/service";
import { withRequestId } from "@/lib/observability";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/papers/[id]/fulltext
 * Returns the normalized canonical PaperDocument, or a friendly unavailable
 * envelope (never a stack trace). Shared cache; no user-specific data.
 *
 * Rate limited (40 req / 60 s / IP): the heaviest route in the app — a miss pulls
 * full JATS XML from Europe PMC, parses it, then sanitizes it through DOMPurify +
 * jsdom, which is both CPU- and memory-hungry on a 768 MB heap cap.
 *
 * NOTE ON withRequestId: this handler takes a second `{ params }` argument, which
 * the wrapper's Handler type does not model, so the params object is threaded
 * through a closure instead of being passed to the wrapper.
 */
const FULLTEXT_LIMIT = 40;
const FULLTEXT_WINDOW_S = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withRequestId(async (r: NextRequest) => {
    const rl = await rateLimit(`fulltext:${clientIp(r)}`, FULLTEXT_LIMIT, FULLTEXT_WINDOW_S);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "rate_limited", message: "Too many full-text requests. Please wait a moment." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? FULLTEXT_WINDOW_S) } }
      );
    }

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
  })(req);
}
