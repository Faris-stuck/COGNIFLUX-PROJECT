import { NextRequest, NextResponse } from "next/server";
import { cached } from "@/lib/db";
import { WorkSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/papers/[id] - id is URL-encoded canonical id (doi:... | oa:...) */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let decoded: string;
  try {
    decoded = decodeURIComponent(id);
  } catch {
    return NextResponse.json({ error: "invalid_id", message: "Malformed paper identifier." }, { status: 400 });
  }

  try {
    const work = await cached(`cf:work:v1:${decoded}`, 86_400, async () => {
      // dynamic import to avoid orchestrator init on cold paths
      const { getOrchestrator } = await import("@/lib/providers/orchestrator");
      return getOrchestrator().getWork(decoded);
    });

    if (!work) {
      return NextResponse.json(
        { error: "not_found", message: "We couldn't find this paper. It may have been removed from the source." },
        { status: 404 }
      );
    }
    const validated = WorkSchema.safeParse(work);
    if (!validated.success) {
      return NextResponse.json({ error: "bad_data", message: "Paper data was incomplete at the source." }, { status: 502 });
    }
    return NextResponse.json(validated.data, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch (e) {
    console.error("[paper]", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "fetch_failed", message: "We couldn't retrieve this paper right now. Please try again." },
      { status: 502 }
    );
  }
}
