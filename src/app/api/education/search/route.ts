import { NextRequest, NextResponse } from "next/server";
import { EducationSearchParamsSchema, EDUCATION_SUBJECTS, EDUCATION_LEVELS } from "@/lib/education/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/education/search?q=&level=&subject=&grade=&language=&resourceType=
 * &yearFrom=&yearTo=&page=&perPage=
 * Orchestrated education search: parallel providers -> dedup -> rank.
 */
export async function GET(req: NextRequest) {
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
}
