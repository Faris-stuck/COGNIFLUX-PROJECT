import { NextRequest, NextResponse } from "next/server";
import { checkFullTextAvailability } from "@/lib/reader/service";

export const dynamic = "force-dynamic";

/** GET /api/papers/[id]/fulltext/status - cheap [Read]-button probe. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let paperId = id;
  try {
    paperId = decodeURIComponent(id);
  } catch {
    /* keep raw */
  }
  const available = await checkFullTextAvailability(paperId);
  return NextResponse.json({ available });
}
