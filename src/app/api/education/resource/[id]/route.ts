import { NextRequest, NextResponse } from "next/server";
import { cached } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/education/resource/:id  (id = edu:<provider>:<sourceId>) */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^edu:[a-z0-9-]+:.{1,120}$/.test(id)) {
    return NextResponse.json({ error: "not_found", message: "Resource not found." }, { status: 404 });
  }
  try {
    const resource = await cached(`cf:edu-resource:v1:${id}`, 3600, async () => {
      const { EducationOrchestrator } = await import("@/lib/education/orchestrator");
      return new EducationOrchestrator().getResource(decodeURIComponent(id));
    });
    if (!resource) {
      return NextResponse.json({ error: "not_found", message: "Resource not found." }, { status: 404 });
    }
    return NextResponse.json(resource);
  } catch (e) {
    console.error("[education-resource]", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "provider_failed", message: "We couldn't retrieve this resource right now. Please try again." },
      { status: 502 }
    );
  }
}
