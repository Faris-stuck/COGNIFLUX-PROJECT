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

/**
 * Best-effort client identity for rate limiting. Not used for authorization.
 *
 * HEADER TRUST ORDER (important — do not reorder):
 *   1. cf-connecting-ip  Cloudflare OVERWRITES this on every proxied request,
 *                        so a client cannot forge it while traffic goes through
 *                        the CF edge.
 *   2. x-real-ip         set by our own nginx to $remote_addr, which the
 *                        cloudflare-realip snippet has already resolved to the
 *                        true visitor IP.
 *   3. x-forwarded-for   LAST RESORT ONLY. Cloudflare APPENDS to an inbound XFF
 *                        instead of replacing it, so a request carrying
 *                        `X-Forwarded-For: 1.2.3.4` arrives as "1.2.3.4, <real>".
 *                        Reading the first element therefore let a caller pick an
 *                        arbitrary rate-limit bucket per request and bypass the
 *                        limiter entirely. When we must fall back to XFF we take
 *                        the LAST element, which is the hop nearest to us and the
 *                        only one an attacker cannot control.
 */
export function clientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;

  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;

  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return "local";
}
