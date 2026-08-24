import { NextResponse } from "next/server";
import { getPool, getRedis } from "@/lib/db";

/**
 * GET /api/health — production health probe.
 *
 * Response shape:
 * { status, time, checks: { postgres: {up,latencyMs}, redis: {up,latencyMs} }, version, uptimeSeconds }
 *
 * Semantics:
 *  - HTTP 200 always when Postgres is reachable (even if degraded / Redis down),
 *    so monitors can read the body instead of just a status code.
 *  - HTTP 503 only when Postgres is down (the app is effectively unusable).
 */

// Cache the version read at module load — package.json never changes mid-process.
const VERSION = require("../../../../package.json").version as string;

const startedAt = Date.now();

type Check = { up: boolean; latencyMs: number };

async function checkPostgres(): Promise<Check> {
  const start = Date.now();
  try {
    await getPool().query("SELECT 1");
    return { up: true, latencyMs: Date.now() - start };
  } catch {
    return { up: false, latencyMs: Date.now() - start };
  }
}

async function checkRedis(): Promise<Check> {
  const start = Date.now();
  try {
    const redis = await getRedis();
    await redis.ping();
    return { up: true, latencyMs: Date.now() - start };
  } catch {
    return { up: false, latencyMs: Date.now() - start };
  }
}

export const dynamic = "force-dynamic"; // never cache a health probe

export async function GET(): Promise<NextResponse> {
  // Run both probes concurrently; each has its own timeout guard.
  const TIMEOUT_MS = 4000;
  const withTimeout = <T>(p: Promise<T>): Promise<T | null> =>
    Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), TIMEOUT_MS))]);

  const [postgres, redis] = await Promise.all([
    withTimeout(checkPostgres()).then((r) => r ?? { up: false, latencyMs: TIMEOUT_MS }),
    withTimeout(checkRedis()).then((r) => r ?? { up: false, latencyMs: TIMEOUT_MS }),
  ]);

  const body = {
    // "degraded" whenever any dependency is down but the app can still serve
    // (Redis-backed caching/rate-limiting degrades open by design).
    status: postgres.up && redis.up ? "ok" : "degraded",
    time: new Date().toISOString(),
    checks: { postgres, redis },
    version: VERSION,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  };

  return NextResponse.json(body, {
    status: postgres.up ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
