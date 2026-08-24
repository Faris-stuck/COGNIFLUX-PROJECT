import { getPool, getRedis } from "@/lib/db";

/**
 * Shared dependency probes for the health/readiness endpoints.
 *
 * Liveness vs readiness:
 *  - LIVENESS (/health, /api/health): is the process up and is its primary
 *    datastore reachable? Redis being down is "degraded", not dead — caching
 *    and rate limiting both degrade open by design, so the app still serves.
 *  - READINESS (/readyz): should this instance receive traffic? Stricter —
 *    every dependency must be up, otherwise a rollout would shift traffic
 *    onto an instance that can only serve degraded responses.
 */

export type Check = { up: boolean; latencyMs: number };
export type Checks = { postgres: Check; redis: Check };

const PROBE_TIMEOUT_MS = 4000;

async function timed(fn: () => Promise<unknown>): Promise<Check> {
  const start = Date.now();
  try {
    await fn();
    return { up: true, latencyMs: Date.now() - start };
  } catch {
    return { up: false, latencyMs: Date.now() - start };
  }
}

function withTimeout<T>(p: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), PROBE_TIMEOUT_MS)),
  ]);
}

const TIMED_OUT: Check = { up: false, latencyMs: PROBE_TIMEOUT_MS };

export async function probeDependencies(): Promise<Checks> {
  const [postgres, redis] = await Promise.all([
    withTimeout(timed(() => getPool().query("SELECT 1")), TIMED_OUT),
    withTimeout(
      timed(async () => {
        const redis = await getRedis();
        await redis.ping();
      }),
      TIMED_OUT
    ),
  ]);
  return { postgres, redis };
}

export const PROCESS_STARTED_AT = Date.now();

export function uptimeSeconds(): number {
  return Math.round((Date.now() - PROCESS_STARTED_AT) / 1000);
}
