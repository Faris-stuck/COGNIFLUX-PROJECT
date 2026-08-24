import { NextResponse } from "next/server";
import { probeDependencies, uptimeSeconds } from "@/lib/health";

/**
 * GET /api/health — liveness probe.
 *
 * { status, time, checks: { postgres: {up,latencyMs}, redis: {up,latencyMs} }, version, uptimeSeconds }
 *
 * Semantics:
 *  - 200 while Postgres is reachable, even if Redis is down (Redis-backed
 *    caching and rate limiting both degrade open), with status="degraded".
 *  - 503 only when Postgres is down — the app cannot serve meaningfully.
 * For "should this instance take traffic?", use /readyz instead.
 */

// Read once at module load — package.json cannot change mid-process.
const VERSION = require("../../../../package.json").version as string;

export const dynamic = "force-dynamic"; // never cache a health probe

export async function GET(): Promise<NextResponse> {
  const checks = await probeDependencies();
  const allUp = checks.postgres.up && checks.redis.up;

  return NextResponse.json(
    {
      status: allUp ? "ok" : "degraded",
      time: new Date().toISOString(),
      checks,
      version: VERSION,
      uptimeSeconds: uptimeSeconds(),
    },
    {
      status: checks.postgres.up ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
