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

export async function getRedis(): Promise<RedisClientType> {
  if (global._cfRedis) return global._cfRedis;
  if (!redisConnecting) {
    redisConnecting = (async () => {
      const client = createClient({
        url: process.env.REDIS_URL ?? "redis://localhost:6379",
        socket: { connectTimeout: 3000, reconnectStrategy: (retries) => Math.min(retries * 200, 5000) },
      }) as RedisClientType;
      client.on("error", (e) => console.error("[redis]", e.message));
      await client.connect();
      global._cfRedis = client;
      return client;
    })();
    redisConnecting.catch(() => {
      redisConnecting = null; // allow retry on next call
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
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
    } catch {
      /* ignore write failure */
    }
  }
  return value;
}
