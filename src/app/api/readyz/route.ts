import { NextResponse } from "next/server";
import { probeDependencies, uptimeSeconds } from "@/lib/health";

/**
 * GET /readyz — readiness probe (also served at /api/readyz).
 *
 * Stricter than /api/health on purpose: readiness answers "should this instance
 * receive traffic?", so EVERY dependency must be up. A load balancer that
 * treated a Redis-less instance as ready would send users to a node that can
 * only serve degraded responses.
 *
 * 200 { ready: true, ... } | 503 { ready: false, notReady: [...] }
 */

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const checks = await probeDependencies();
  const notReady = Object.entries(checks)
    .filter(([, c]) => !c.up)
    .map(([name]) => name);
  const ready = notReady.length === 0;

  return NextResponse.json(
    {
      ready,
      time: new Date().toISOString(),
      checks,
      ...(ready ? {} : { notReady }),
      uptimeSeconds: uptimeSeconds(),
    },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
