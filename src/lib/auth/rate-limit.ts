import { getRedis } from "@/lib/db";

/**
 * Simple fixed-window rate limiter backed by Redis (INCR + EXPIRE).
 * Degrades open: if Redis is unavailable, requests are allowed (search must
 * stay up); auth endpoints additionally rely on scrypt cost for brute-force
 * resistance in that degraded mode.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; retryAfter?: number }> {
  try {
    const redis = await getRedis();
    const redisKey = `cf:rl:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) await redis.expire(redisKey, windowSeconds);
    if (count > limit) {
      const ttl = await redis.ttl(redisKey);
      return { allowed: false, remaining: 0, retryAfter: ttl > 0 ? ttl : windowSeconds };
    }
    return { allowed: true, remaining: Math.max(0, limit - count) };
  } catch {
    return { allowed: true, remaining: limit };
  }
}

/** Best-effort client identity for rate limiting. Not used for authorization. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}
