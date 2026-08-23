import { NextResponse } from "next/server";
import { getOrchestrator } from "@/lib/providers/orchestrator";

export const dynamic = "force-dynamic";

/**
 * GET /api/providers - provider registry for admin/health UI.
 * Includes academic + education providers and pending (non-callable) ones.
 */
export async function GET() {
  const { EducationOrchestrator } = await import("@/lib/education/orchestrator");
  const { SIBI_PROVIDER_STATUS, RUMAH_BELAJAR_PROVIDER_STATUS } = await import("@/lib/education/pending");

  return NextResponse.json({
    academic: getOrchestrator().listProviders(),
    education: new EducationOrchestrator().listProviders(),
    pending: [SIBI_PROVIDER_STATUS, RUMAH_BELAJAR_PROVIDER_STATUS],
    time: new Date().toISOString(),
  });
}
