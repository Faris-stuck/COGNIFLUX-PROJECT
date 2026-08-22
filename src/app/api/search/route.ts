import { NextRequest, NextResponse } from "next/server";
import { SearchParamsSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=...&page=1&perPage=20&yearFrom=&yearTo=&openAccessOnly=&sort=
 * Orchestrated, cached, deduplicated search across providers.
 */
export async function GET(req: NextRequest) {
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
}
