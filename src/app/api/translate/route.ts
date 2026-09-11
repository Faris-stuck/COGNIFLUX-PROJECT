import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { withRequestId } from "@/lib/observability";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";
const LOCAL_TRANSLATOR = "http://127.0.0.1:8091/translate";

function cacheKey(target: string, text: string) {
  return `cf:tr:${target}:${crypto.createHash("sha256").update(text).digest("hex")}`;
}

export const POST = withRequestId(async (req: NextRequest) => {
  const rl = await rateLimit(`translate:${clientIp(req)}`, 60, 60);
  if (!rl.allowed) return NextResponse.json({ error: "rate_limited", retryAfter: rl.retryAfter ?? 60 }, { status: 429 });

  const body = await req.json().catch(() => null) as { target?: "id" | "en"; texts?: unknown } | null;
  if (!body || (body.target !== "id" && body.target !== "en") || !Array.isArray(body.texts) || body.texts.length < 1 || body.texts.length > 80) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const texts = body.texts.filter((x): x is string => typeof x === "string").map(x => x.trim()).filter(Boolean);
  if (!texts.length || texts.some(x => x.length > 6000)) return NextResponse.json({ error: "invalid_text" }, { status: 400 });

  const out = new Array<string>(texts.length);
  const misses: Array<{ index: number; text: string; key: string }> = [];
  let redis: Awaited<ReturnType<typeof getRedis>> | null = null;
  try { redis = await getRedis(); } catch { /* no-cache mode */ }

  for (let i = 0; i < texts.length; i++) {
    const key = cacheKey(body.target, texts[i]);
    let hit: string | null = null;
    if (redis) { try { hit = await redis.get(key); } catch { /* cache miss */ } }
    if (hit) out[i] = hit;
    else misses.push({ index: i, text: texts[i], key });
  }

  if (misses.length) {
    let translated: string[];
    try {
      const r = await fetch(LOCAL_TRANSLATOR, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ target: body.target, texts: misses.map(m => m.text) }), signal: AbortSignal.timeout(20_000), cache: "no-store" });
      if (!r.ok) throw new Error(`translator_${r.status}`);
      const data = await r.json() as { translations?: unknown };
      if (!Array.isArray(data.translations) || data.translations.length !== misses.length || data.translations.some(x => typeof x !== "string")) throw new Error("translator_invalid_response");
      translated = data.translations as string[];
    } catch (e) {
      console.error("[translate]", e instanceof Error ? e.message : e);
      return NextResponse.json({ error: "translation_unavailable", message: "Translation service is temporarily unavailable." }, { status: 503 });
    }
    for (let i = 0; i < misses.length; i++) {
      out[misses[i].index] = translated[i];
      if (redis) { try { await redis.set(misses[i].key, translated[i], { EX: 60 * 60 * 24 * 30 }); } catch { /* best effort */ } }
    }
  }

  return NextResponse.json({ target: body.target, translations: out }, { headers: { "Cache-Control": "private, max-age=0, must-revalidate" } });
});
