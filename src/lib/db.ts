import { Pool } from "pg";
import { createClient, type RedisClientType } from "redis";

// ---- PostgreSQL pool (lazy singleton) ----
declare global {
  // eslint-disable-next-line no-var
  var _cfPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var _cfRedis: RedisClientType | undefined;
}

export function getPool(): Pool {
  if (!global._cfPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      // Fail fast and loudly. A hardcoded fallback here would let production
      // boot "successfully" and then fail on every query with a confusing
      // connection error instead of naming the missing variable.
      throw new Error("DATABASE_URL is not set — refusing to start a database pool.");
    }
    global._cfPool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return global._cfPool;
}

let redisConnecting: Promise<RedisClientType> | null = null;
/** Circuit breaker: after a failed connect, stop retrying for this long. */
const REDIS_RETRY_COOLDOWN_MS = 10_000;
const REDIS_CONNECT_TIMEOUT_MS = 3_000;
let redisUnavailableUntil = 0;

export async function getRedis(): Promise<RedisClientType> {
  if (global._cfRedis) return global._cfRedis;

  // Circuit open: fail immediately instead of making every request pay the
  // connect timeout while Redis is down.
  if (Date.now() < redisUnavailableUntil) {
    throw new Error("redis: unavailable (circuit open)");
  }

  if (!redisConnecting) {
    redisConnecting = (async () => {
      const client = createClient({
        url: process.env.REDIS_URL ?? "redis://localhost:6379",
        socket: {
          connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
          // MUST be bounded. Returning a delay forever makes connect() never
          // settle, so callers await it indefinitely and every consumer of
          // cached() hangs instead of degrading open. Returning an Error tells
          // node-redis to stop retrying and reject.
          reconnectStrategy: (retries) =>
            retries > 3 ? new Error("redis: giving up after 3 retries") : Math.min(retries * 200, 1000),
        },
      }) as RedisClientType;
      client.on("error", (e) => console.error("[redis]", e.message));

      // Belt and braces: even a bounded strategy shouldn't be able to outlast
      // a request. Hard-cap the whole connect attempt.
      let timer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          client.connect(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("redis: connect timeout")),
              REDIS_CONNECT_TIMEOUT_MS * 2
            );
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }

      global._cfRedis = client;
      return client;
    })();
    redisConnecting.catch(() => {
      redisConnecting = null; // allow retry after the cooldown
      redisUnavailableUntil = Date.now() + REDIS_RETRY_COOLDOWN_MS;
    });
  }
  return redisConnecting;
}

/** Cache-aside helper. Never throws on Redis failure - degrades to no cache. */
export async function cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
  let redis: RedisClientType | null = null;
  try {
    redis = await getRedis();
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch {
    /* cache unavailable -> pass through */
  }
  const value = await fn();
  if (redis && value !== null && value !== undefined) {
    try {
      await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
    } catch {
      /* ignore write failure */
    }
  }
  return value;
}
