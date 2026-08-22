import { NextResponse } from "next/server";
import { getOrchestrator } from "@/lib/providers/orchestrator";

export const dynamic = "force-dynamic";

/** GET /api/providers - provider list + capabilities (for admin/health UI later). */
export async function GET() {
  return NextResponse.json({
    providers: getOrchestrator().listProviders(),
    time: new Date().toISOString(),
  });
}
