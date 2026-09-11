import { NextRequest, NextResponse } from "next/server";
import { SearchParamsSchema } from "@/lib/types";
import { withRequestId } from "@/lib/observability";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=...&page=1&perPage=20&yearFrom=&yearTo=&openAccessOnly=&sort=
 * Orchestrated, cached, deduplicated search across providers.
 * Wrapped in withRequestId: emits one JSON access-log line + x-request-id header.
 *
 * Rate limited (90 req / 60 s / IP) because a cache miss fans out to OpenAlex and
 * Crossref, whose politeness policies apply to our whole origin: one abusive
 * client could get every user throttled upstream. nginx enforces a coarser limit
 * at the edge; this is the app-level backstop that also covers loopback traffic.
 */
const SEARCH_LIMIT = 90;
const SEARCH_WINDOW_S = 60;

export const GET = withRequestId(async (req: NextRequest) => {
  const rl = await rateLimit(`search:${clientIp(req)}`, SEARCH_LIMIT, SEARCH_WINDOW_S);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many searches. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? SEARCH_WINDOW_S) } }
    );
  }

  const sp = req.nextUrl.searchParams;
  const parsed = SearchParamsSchema.safeParse({
    q: sp.get("q") ?? "",
    page: sp.get("page") ?? undefined,
    perPage: sp.get("perPage") ?? undefined,
    yearFrom: sp.get("yearFrom") || undefined,
    yearTo: sp.get("yearTo") || undefined,
    openAccessOnly: sp.get("openAccessOnly") === "true",
    sort: sp.get("sort") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query", message: "Please enter a search term between 1 and 500 characters." },
      { status: 400 }
    );
  }

  try {
    const { getOrchestrator } = await import("@/lib/providers/orchestrator");
    const result = await getOrchestrator().search(parsed.data);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch (e) {
    console.error("[search]", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "all_providers_failed", message: "We couldn't retrieve results right now. Please try again." },
      { status: 502 }
    );
  }
});
