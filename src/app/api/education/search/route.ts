import { NextRequest, NextResponse } from "next/server";
import { EducationSearchParamsSchema } from "@/lib/education/types";
import { withRequestId } from "@/lib/observability";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/education/search?q=&level=&subject=&grade=&language=&resourceType=
 * &yearFrom=&yearTo=&page=&perPage=
 * Orchestrated education search: parallel providers -> dedup -> rank.
 * Wrapped in withRequestId: emits one JSON access-log line + x-request-id header.
 *
 * Rate limited (90 req / 60 s / IP): a miss fans out to OpenStax + Open Textbook
 * Library. Same reasoning as /api/search — protect shared upstream quota.
 */
const SEARCH_LIMIT = 90;
const SEARCH_WINDOW_S = 60;

export const GET = withRequestId(async (req: NextRequest) => {
  const rl = await rateLimit(`edu-search:${clientIp(req)}`, SEARCH_LIMIT, SEARCH_WINDOW_S);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many searches. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? SEARCH_WINDOW_S) } }
    );
  }

  const sp = req.nextUrl.searchParams;
  const list = (k: string) => sp.getAll(k).flatMap((v) => v.split(",")).filter(Boolean);
  const parsed = EducationSearchParamsSchema.safeParse({
    q: sp.get("q") ?? "",
    page: sp.get("page") ?? undefined,
    perPage: sp.get("perPage") ?? undefined,
    level: list("level"),
    grade: sp.get("grade") || undefined,
    subject: list("subject"),
    language: list("language"),
    resourceType: list("resourceType"),
    yearFrom: sp.get("yearFrom") || undefined,
    yearTo: sp.get("yearTo") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query", message: "Please enter a search term between 1 and 500 characters." },
      { status: 400 }
    );
  }

  try {
    const { EducationOrchestrator } = await import("@/lib/education/orchestrator");
    const result = await new EducationOrchestrator().search(parsed.data);
    return NextResponse.json(result, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (e) {
    console.error("[education-search]", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "all_providers_failed", message: "We couldn't retrieve learning resources right now. Please try again." },
      { status: 502 }
    );
  }
});
